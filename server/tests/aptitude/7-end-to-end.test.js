// Whole-section check: one student's journey through every Aptitude feature,
// plus a sweep of sign-in, permission and answer-leak rules on every route.
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
  await Promise.all(Object.values(M).map((m) => m.syncIndexes()));
  await UserBadge.syncIndexes();
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await M.AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published', source: 'codesphere' })));
  await M.AptitudeTest.insertMany(require(path.join(SERVER, 'data/aptitudeTests')).map((t) => ({ ...t, status: 'published' })));
  const mk = async (name, extra = {}) => { const u = await User.collection.insertOne({ name, email: `${name}@x.com`, role: 'user', ...extra }); return { id: u.insertedId, tok: jwt.sign({ id: String(u.insertedId) }, 'test-secret') }; };
  const S = await mk('Student');
  const ED = await mk('Editor', { staffRoles: ['aptitude-editor'] });

  // Same mount order as server.js.
  const app = express();
  app.use(express.json());
  app.use('/api/aptitude/admin', require(path.join(SERVER, 'routes/aptitudeAdminRoutes')));
  app.use('/api/aptitude/tests', require(path.join(SERVER, 'routes/aptitudeTestRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeProgressRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeDailyRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  app.use('/api/leaderboard', require(path.join(SERVER, 'routes/leaderboardRoutes')));
  app.use('/api/badges', require(path.join(SERVER, 'routes/badgeRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, body, token = S.tok) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, text };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? `  (${extra})` : ''}`); };
  const leaks = (text) => (text.match(/"(answer|explanation|shortcut)"/) || [])[1];

  // ----- Sweep 1: sign-in required -----
  const anyId = String((await M.AptitudeQuestion.findOne().lean())._id);
  const fake = new mongoose.Types.ObjectId().toString();
  const needAuth = [
    ['GET', '/aptitude/me'], ['GET', '/aptitude/practice'], ['GET', `/aptitude/questions/${anyId}/hint`],
    ['POST', `/aptitude/questions/${anyId}/reveal`], ['POST', `/aptitude/questions/${anyId}/bookmark`], ['POST', `/aptitude/questions/${anyId}/answer`],
    ['GET', '/aptitude/analytics'], ['GET', '/aptitude/mistakes'], ['POST', `/aptitude/mistakes/${anyId}`], ['DELETE', `/aptitude/mistakes/${anyId}`],
    ['POST', '/aptitude/daily/start'], ['POST', '/aptitude/daily/submit'],
    ['GET', '/aptitude/tests/attempts'], ['GET', `/aptitude/tests/attempts/${fake}`], ['PATCH', `/aptitude/tests/attempts/${fake}/items/0`], ['POST', `/aptitude/tests/attempts/${fake}/submit`], ['POST', '/aptitude/tests/quant-quick-mock/start'],
    ['GET', '/aptitude/admin/questions'], ['GET', '/aptitude/admin/stats'], ['GET', '/aptitude/admin/tests'],
  ];
  const noAuth = [];
  for (const [m, u] of needAuth) { const r = await call(m, u, m === 'GET' ? null : {}, null); if (r.status !== 401) noAuth.push(`${m} ${u} → ${r.status}`); }
  check(`all ${needAuth.length} private routes need sign-in`, !noAuth.length, noAuth.join('; '));

  const publicRoutes = ['/aptitude/catalog', '/aptitude/topics/percentage', '/aptitude/tests', '/aptitude/tests/quant-quick-mock', '/aptitude/daily', '/aptitude/leaderboard'];
  const pub = [];
  for (const u of publicRoutes) { const r = await call('GET', u, null, null); if (r.status !== 200 || leaks(r.text)) pub.push(`${u} → ${r.status} ${leaks(r.text) || ''}`); }
  check('public routes open to guests with no answers in them', !pub.length, pub.join('; '));

  // ----- Sweep 2: editor-only routes -----
  const adminRoutes = [['GET', '/aptitude/admin/questions'], ['GET', `/aptitude/admin/questions/${anyId}`], ['POST', '/aptitude/admin/questions'], ['PUT', `/aptitude/admin/questions/${anyId}`], ['DELETE', `/aptitude/admin/questions/${anyId}`], ['POST', '/aptitude/admin/questions/status'], ['POST', '/aptitude/admin/questions/import'], ['GET', '/aptitude/admin/tests'], ['POST', '/aptitude/admin/tests'], ['PUT', `/aptitude/admin/tests/${fake}`], ['DELETE', `/aptitude/admin/tests/${fake}`], ['GET', '/aptitude/admin/stats']];
  const notBlocked = [];
  for (const [m, u] of adminRoutes) { const r = await call(m, u, m === 'GET' ? null : {}); if (r.status !== 403) notBlocked.push(`${m} ${u} → ${r.status}`); }
  check(`all ${adminRoutes.length} admin routes refuse plain students`, !notBlocked.length, notBlocked.join('; '));
  check('question still exists after the refused delete', await M.AptitudeQuestion.exists({ _id: anyId }));

  // ----- Sweep 3: bad ids never crash (no 500s) -----
  const bad = [['GET', '/aptitude/questions/not-an-id/hint'], ['POST', '/aptitude/questions/not-an-id/answer'], ['GET', '/aptitude/tests/attempts/not-an-id'], ['POST', '/aptitude/mistakes/not-an-id'], ['GET', '/aptitude/topics/nope'], ['GET', '/aptitude/tests/nope'], ['GET', '/aptitude/practice?page=-5&difficulty=zzz&status=zzz']];
  const crashed = [];
  for (const [m, u] of bad) { const r = await call(m, u, m === 'GET' ? null : { selected: 0 }); if (r.status >= 500) crashed.push(`${m} ${u} → ${r.status}`); }
  check('bad ids and junk filters give 4xx, never 500', !crashed.length, crashed.join('; '));

  // ----- Journey -----
  let r = await call('GET', '/aptitude/me');
  check('new student starts at zero', r.data.summary.questionsAttempted === 0 && r.data.summary.level.name === 'Beginner');

  r = await call('GET', '/aptitude/practice?category=quantitative');
  check('practice list has no answers', r.status === 200 && r.data.total > 0 && !leaks(r.text));
  const qs = await M.AptitudeQuestion.find({ category: 'quantitative' }).limit(6).lean();
  for (const q of qs.slice(0, 5)) await call('POST', `/aptitude/questions/${q._id}/answer`, { selected: q.answer, seconds: 30 });
  r = await call('POST', `/aptitude/questions/${qs[5]._id}/answer`, { selected: (qs[5].answer + 1) % 4, seconds: 30 });
  check('wrong answer reveals the solution only after answering', r.data.correct === false && Number.isInteger(r.data.answer));
  check('5 answers today claims the daily goal', r.data.answeredToday === 6);

  r = await call('GET', '/aptitude/daily');
  const startD = await call('POST', '/aptitude/daily/start');
  check('daily start has no answers', !leaks(startD.text));
  const dq = await M.AptitudeQuestion.find({ _id: { $in: startD.data.questions.map((x) => x.id) } }).lean();
  const ansMap = new Map(dq.map((q) => [String(q._id), q.answer]));
  r = await call('POST', '/aptitude/daily/submit', { answers: startD.data.questions.map((x) => ansMap.get(x.id)) });
  check('perfect daily', r.data.result.correctCount === 5 && r.data.result.xp === 30);

  r = await call('POST', '/aptitude/tests/quant-quick-mock/start');
  const attemptId = r.data.attemptId;
  r = await call('GET', `/aptitude/tests/attempts/${attemptId}`);
  check('exam view has no answers', r.data.exam && !leaks(r.text));
  const att = await M.AptitudeTestAttempt.findById(attemptId).lean();
  const tq = new Map((await M.AptitudeQuestion.find({ _id: { $in: att.items.map((i) => i.question) } }).lean()).map((q) => [String(q._id), q.answer]));
  for (let i = 0; i < att.items.length; i += 1) {
    const right = att.items[i].order.indexOf(tq.get(String(att.items[i].question)));
    await call('PATCH', `/aptitude/tests/attempts/${attemptId}/items/${i}`, { selected: i < 7 ? right : (right + 1) % 4 });
  }
  r = await call('POST', `/aptitude/tests/attempts/${attemptId}/submit`);
  check('test scored 7 − 3×0.25', r.data.result.score === 6.25 && r.data.result.xp === 14, r.data.result.score);

  r = await call('GET', '/aptitude/analytics');
  check('analytics include practice, daily and test', r.data.tests.length === 1 && r.data.activity[29].answered >= 11 && r.data.categories.some((c) => c.answered > 0));
  r = await call('GET', '/aptitude/mistakes');
  check('notebook holds the practice and test mistakes', r.data.open >= 4, r.data.open);

  r = await call('GET', '/aptitude/me');
  const s = r.data.summary;
  const expectXp = qs.slice(0, 5).reduce((t, q) => t + ({ 'very-easy': 2, easy: 4, medium: 6, hard: 10 }[q.difficulty]), 0) + 10 + 30 + 14;
  check('aptitude XP adds up (practice + goal + daily + test)', s.xp === expectXp, `${s.xp} vs ${expectXp}`);
  r = await call('GET', '/leaderboard');
  const me = (r.data.rows || []).find((x) => x.name === 'Student');
  check('same XP on the main leaderboard', me && me.aptitudeXp === expectXp && me.xp === expectXp, me && `${me.xp}/${me.aptitudeXp}`);
  r = await call('GET', '/aptitude/leaderboard');
  check('top of the weekly aptitude board', r.data.rows[0]?.name === 'Student' && r.data.me.rank === 1);
  const badges = (await UserBadge.find({ user: S.id }).lean()).map((b) => b.badgeId);
  check('badges earned on the way', badges.includes('first-step') && badges.includes('perfect-day'), badges.join(','));

  // Editor publishes a new question; the student sees it in practice.
  const before = (await call('GET', '/aptitude/practice?topic=percentage')).data.total;
  r = await call('POST', '/aptitude/admin/questions', { topic: 'percentage', statement: 'What is 5% of 400?', options: ['20', '25', '40', '15'], answer: 'A', explanation: '400 × 0.05 = 20.', status: 'published' }, ED.tok);
  check('editor creates a published question', r.status === 201);
  r = await call('GET', '/aptitude/practice?topic=percentage&status=new');
  const after = (await call('GET', '/aptitude/practice?topic=percentage')).data.total;
  check('student sees it straight away', after === before + 1 && await M.AptitudeQuestion.exists({ statement: 'What is 5% of 400?', status: 'published' }));

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
