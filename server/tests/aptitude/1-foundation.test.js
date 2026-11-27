const path = require('path');
const SERVER = require('path').resolve(__dirname, '../..');
process.env.JWT_SECRET = 'test-secret';
const { MongoMemoryServer } = require('mongodb-memory-server');
const req = (m) => require(path.join(SERVER, 'node_modules', m));
const mongoose = req('mongoose');
const express = req('express');
const jwt = req('jsonwebtoken');

(async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const User = require(path.join(SERVER, 'models/User'));
  const { AptitudeQuestion, AptitudeAttempt, AptitudeProgress } = require(path.join(SERVER, 'models/Aptitude'));
  const { dateInIndia, shiftDate } = require(path.join(SERVER, 'utils/progress'));
  const u = await User.collection.insertOne({ name: 'Riya Sen', email: 'r@x.com', role: 'user' });
  const q = (code, topic, difficulty, status = 'published') => ({
    code, statement: 'Q?', category: 'quantitative', topic, difficulty, options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'because', status,
  });
  const [q1, q2] = await AptitudeQuestion.create([q('QA-1', 'percentage', 'easy'), q('QA-2', 'percentage', 'hard'), q('QA-3', 'percentage', 'easy', 'draft'), q('QA-4', 'average', 'medium')]);
  await AptitudeAttempt.create([
    { user: u.insertedId, question: q1._id, correct: false, seconds: 50 },
    { user: u.insertedId, question: q1._id, correct: true, seconds: 30, xp: 5 },
    { user: u.insertedId, question: q2._id, correct: true, seconds: 90, xp: 10 },
  ]);
  await AptitudeProgress.create({ user: u.insertedId, streak: 4, bestStreak: 6, lastActiveDay: shiftDate(dateInIndia(), -1), bonusXp: 10 });

  const app = express();
  app.use(express.json());
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/aptitude`;
  const token = jwt.sign({ id: String(u.insertedId) }, 'test-secret');
  const get = async (url, auth) => {
    const res = await fetch(base + url, { headers: auth ? { Authorization: `Bearer ${token}` } : {} });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };

  let r = await get('/catalog');
  const quant = r.data.categories.find((c) => c.slug === 'quantitative');
  const pct = quant.topics.find((t) => t.slug === 'percentage');
  check('catalog lists 4 categories, 65 topics', r.data.categories.length === 4 && r.data.categories.reduce((s, c) => s + c.topics.length, 0) === 65);
  check('counts only published questions', pct.questions === 2 && quant.questions === 3, `percentage ${pct.questions}, quant ${quant.questions}`);
  check('placement tracks listed', r.data.tracks.length === 8);
  r = await get('/topics/percentage');
  check('topic page works', r.status === 200 && r.data.topic.byDifficulty.easy === 1 && r.data.topic.byDifficulty.hard === 1);
  r = await get('/topics/not-a-topic');
  check('unknown topic → 404', r.status === 404);
  r = await get('/me');
  check('summary needs sign-in', r.status === 401);
  r = await get('/me', true);
  const s = r.data.summary;
  check('summary totals', s.questionsAttempted === 2 && s.questionsSolved === 2 && s.answers === 3 && s.accuracy === 67, JSON.stringify({ a: s.questionsAttempted, solved: s.questionsSolved, acc: s.accuracy }));
  check('practice time and XP (incl. bonus)', s.practiceSeconds === 170 && s.xp === 25, `${s.practiceSeconds}s, ${s.xp} XP`);
  check('streak alive (active yesterday)', s.streak === 4 && s.bestStreak === 6);
  await AptitudeProgress.updateOne({ user: u.insertedId }, { lastActiveDay: shiftDate(dateInIndia(), -3) });
  r = await get('/me', true);
  check('streak expires after a missed day', r.data.summary.streak === 0);

  console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed.');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
