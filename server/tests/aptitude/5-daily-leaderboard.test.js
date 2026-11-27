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
  const UserBadge = require(path.join(SERVER, 'models/UserBadge'));
  const M = require(path.join(SERVER, 'models/Aptitude'));
  await Promise.all([M.AptitudeAttempt.syncIndexes(), M.AptitudeDailyAttempt.syncIndexes(), M.AptitudeDaily.syncIndexes(), UserBadge.syncIndexes()]);
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await M.AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published' })));
  const mk = async (name) => { const u = await User.collection.insertOne({ name, email: `${name}@x.com`, role: 'user', yearOfStudy: '2nd Year' }); return { id: u.insertedId, tok: jwt.sign({ id: String(u.insertedId) }, 'test-secret') }; };
  const A = await mk('Asha');
  const B = await mk('Bilal');
  const C = await mk('Chandni');

  const app = express();
  app.use(express.json());
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeProgressRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeDailyRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  app.use('/api/leaderboard', require(path.join(SERVER, 'routes/leaderboardRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, body, token = A.tok) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? `  (${extra})` : ''}`); };

  let r = await call('GET', '/aptitude/daily', null, null);
  check('guest sees today summary', r.data.available && r.data.count === 5 && !r.data.questions);
  const [g1, g2] = await Promise.all([call('GET', '/aptitude/daily'), call('GET', '/aptitude/daily', null, B.tok)]);
  check('one daily set even with parallel first visits', (await M.AptitudeDaily.countDocuments()) === 1 && g1.data.state === 'new' && g2.data.state === 'new');
  const daily = await M.AptitudeDaily.findOne().lean();
  const qs = await M.AptitudeQuestion.find({ _id: { $in: daily.questions } }).lean();
  const cats = qs.map((q) => q.category).sort().join(',');
  check('mix across categories', cats === 'data-interpretation,logical,quantitative,quantitative,verbal', cats);
  r = await call('POST', '/aptitude/daily/submit', { answers: [0] });
  check('submit before start refused', r.status === 409);
  r = await call('POST', '/aptitude/daily/start');
  const leak = JSON.stringify(r.data).match(/"(answer|explanation)"/);
  check('start gives 5 questions without answers', r.data.questions.length === 5 && !leak, leak?.[0]);
  const ans = new Map(qs.map((q) => [String(q._id), q.answer]));
  const right = r.data.questions.map((q) => ans.get(q.id));
  r = await call('GET', '/aptitude/daily');
  check('refresh keeps it started', r.data.state === 'started' && r.data.questions.length === 5);

  const [s1, s2] = await Promise.all([call('POST', '/aptitude/daily/submit', { answers: right }), call('POST', '/aptitude/daily/submit', { answers: right })]);
  const ok = [s1, s2].find((x) => x.status === 200);
  check('double submit counts once', [s1.status, s2.status].sort().join() === '200,409');
  check('perfect score XP = 5*4 + 10', ok.data.result.xp === 30 && ok.data.result.correctCount === 5, ok.data.result.xp);
  check('solutions after submit', ok.data.questions[0].explanation && Number.isInteger(ok.data.questions[0].answer));
  check('perfect-day badge awarded', ok.data.badges.some((b) => b.id === 'perfect-day'), JSON.stringify(ok.data.badges));
  r = await call('POST', '/aptitude/daily/start');
  check('cannot redo today', r.status === 409);
  r = await call('GET', '/aptitude/daily');
  check('done state + week strip', r.data.state === 'done' && r.data.week.length === 7 && r.data.week[6].done && r.data.streak === 1);
  const prog = await M.AptitudeProgress.findOne({ user: A.id }).lean();
  check('daily XP added to bonus', prog.bonusXp === 30, prog.bonusXp);

  // B: late submit gets no XP
  await call('POST', '/aptitude/daily/start', null, B.tok);
  await M.AptitudeDailyAttempt.updateOne({ user: B.id }, { startedAt: new Date(Date.now() - 400000) });
  r = await call('POST', '/aptitude/daily/submit', { answers: right }, B.tok);
  check('late submit: no answers counted, no XP', r.data.result.xp === 0 && r.data.result.correctCount === 0 && r.data.result.late);

  // C: practise a hard question for more XP than A this week
  const hard = await M.AptitudeQuestion.find({ difficulty: 'hard' }).limit(4).lean();
  for (const q of hard) await call('POST', `/aptitude/questions/${q._id}/answer`, { selected: q.answer }, C.tok);
  r = await call('GET', '/aptitude/leaderboard?period=week', null, C.tok);
  check('weekly leaderboard ranks', r.data.rows.map((x) => x.name).join() === 'Chandni,Asha' && r.data.me.rank === 1, r.data.rows.map((x) => `${x.name}:${x.xp}`).join());
  r = await call('GET', '/aptitude/leaderboard?period=all', null, null);
  check('all-time leaderboard works for guests', r.status === 200 && r.data.rows.length === 2 && r.data.me === null);

  r = await call('GET', '/leaderboard', null, A.tok);
  const rows = r.data.leaderboard || r.data.rows || r.data;
  const asha = (Array.isArray(rows) ? rows : []).find((x) => x.name === 'Asha');
  check('aptitude XP counts on the main leaderboard', asha && asha.aptitudeXp === 30 && asha.xp >= 30, JSON.stringify(asha && { xp: asha.xp, ap: asha.aptitudeXp }));
  check('badge saved', await UserBadge.exists({ user: A.id, badgeId: 'perfect-day' }));

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
})().catch((e) => { console.error(e); process.exit(1); });
