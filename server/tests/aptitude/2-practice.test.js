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
  await AptitudeAttempt.syncIndexes();
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published' })));
  await AptitudeQuestion.updateOne({ code: 'QA-SIM-002' }, { status: 'draft' });
  const bank = prepared();
  const inTopic = (t) => bank.filter((x) => x.topic === t).length;
  const u = await User.collection.insertOne({ name: 'Riya Sen', email: 'r@x.com', role: 'user' });
  const token = jwt.sign({ id: String(u.insertedId) }, 'test-secret');

  const app = express();
  app.use(express.json());
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/aptitude`;
  const call = async (method, url, body, auth = true) => {
    const res = await fetch(base + url, { method, headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); };
  const byCode = async (code) => AptitudeQuestion.findOne({ code }).lean();

  let r = await call('GET', '/practice', null, false);
  check('practice needs sign-in', r.status === 401);
  r = await call('GET', '/practice?topic=percentage');
  check('topic filter', r.data.total === inTopic('percentage') && r.data.questions.every((x) => x.topic === 'percentage'), `${r.data.total}`);
  const leaked = JSON.stringify(r.data).match(/"(answer|explanation|shortcut)"/);
  check('no answers or explanations leaked in the list', !leaked, leaked?.[0]);
  r = await call('GET', '/practice?category=quantitative&difficulty=hard');
  check('category + difficulty filter', r.data.questions.every((x) => x.category === 'quantitative' && x.difficulty === 'hard') && r.data.total > 0, `${r.data.total}`);
  r = await call('GET', '/practice');
  check('drafts hidden from practice', !r.data.questions.some((x) => x.code === 'QA-SIM-002') && r.data.total === bank.length - 1, `${r.data.total} total, ${r.data.pages} pages`);

  const pct1 = await byCode('QA-PCT-001');
  const wrong = (pct1.answer + 1) % 4;
  r = await call('POST', `/questions/${pct1._id}/answer`, { selected: wrong, seconds: 40 });
  check('wrong answer evaluated', r.data.correct === false && r.data.answer === pct1.answer && r.data.explanation && r.data.xp === 0);
  const prog = await AptitudeProgress.findOne({ user: u.insertedId }).lean();
  check('wrong answer added to mistake notebook', prog.mistakes.some((m) => String(m.question) === String(pct1._id)));
  r = await call('POST', `/questions/${pct1._id}/answer`, { selected: pct1.answer, seconds: 20 });
  check('retry correct → XP awarded (easy = 4)', r.data.correct && r.data.xp === 4, `xp ${r.data.xp}`);
  r = await call('POST', `/questions/${pct1._id}/answer`, { selected: pct1.answer, seconds: 10 });
  check('answering again earns no more XP', r.data.correct && r.data.xp === 0);

  const hard = await byCode('QA-NUM-003');
  const [a1, a2] = await Promise.all([
    call('POST', `/questions/${hard._id}/answer`, { selected: hard.answer, seconds: 30 }),
    call('POST', `/questions/${hard._id}/answer`, { selected: hard.answer, seconds: 30 }),
  ]);
  check('double-click pays XP only once', a1.data.xp + a2.data.xp === 10, `${a1.data.xp} + ${a2.data.xp}`);

  const med = await byCode('QA-PL-002');
  r = await call('POST', `/questions/${med._id}/reveal`);
  check('reveal returns the solution', r.data.answer === med.answer && r.data.xpForfeited === true);
  r = await call('POST', `/questions/${med._id}/answer`, { selected: med.answer, seconds: 5 });
  check('no XP after peeking at the solution', r.data.correct && r.data.xp === 0);

  r = await call('POST', `/questions/${pct1._id}/answer`, { selected: 9 });
  check('invalid option rejected', r.status === 400);
  r = await call('POST', `/questions/${(await byCode('QA-SIM-002'))._id}/answer`, { selected: 0 });
  check('cannot answer a draft question', r.status === 404);

  r = await call('POST', `/questions/${pct1._id}/bookmark`);
  check('bookmark on', r.data.bookmarked === true);
  r = await call('GET', '/practice?status=bookmarked');
  check('bookmarked filter', r.data.total === 1 && r.data.questions[0].bookmarked);
  r = await call('POST', `/questions/${pct1._id}/bookmark`);
  check('bookmark off', r.data.bookmarked === false);

  r = await call('GET', '/practice?status=correct');
  check('correct filter (3 solved)', r.data.total === 3, `${r.data.total}`);
  r = await call('GET', '/practice?status=new&topic=percentage');
  check('new filter excludes answered ones', r.data.total === inTopic('percentage') - 1, r.data.total);
  r = await call('GET', '/practice?topic=percentage');
  check('state shows correct for solved question', r.data.questions.find((x) => x.code === 'QA-PCT-001').state === 'correct');

  // Daily goal: answer 5+ questions today → +10 once.
  const five = (await AptitudeQuestion.find({ topic: 'number-series' }).lean()).slice(0, 3);
  let last;
  for (const x of five) last = await call('POST', `/questions/${x._id}/answer`, { selected: x.answer, seconds: 10 });
  const p2 = await AptitudeProgress.findOne({ user: u.insertedId }).lean();
  check('daily goal (5 answers) paid once', p2.goalsClaimed.filter((k) => k.endsWith(':answered5')).length === 1 && p2.bonusXp === 10, `bonus ${p2.bonusXp}`);
  check('streak started', last.data.streak === 1);
  r = await call('GET', '/me');
  check('summary reflects practice', r.data.summary.questionsSolved === 6 && r.data.summary.bookmarks === 0 && r.data.summary.mistakes === 1, JSON.stringify({ solved: r.data.summary.questionsSolved, xp: r.data.summary.xp }));

  console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed.');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
