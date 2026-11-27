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
  const M = require(path.join(SERVER, 'models/Aptitude'));
  await M.AptitudeTestAttempt.syncIndexes();
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await M.AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published' })));
  const tests = require(path.join(SERVER, 'data/aptitudeTests'));
  await M.AptitudeTest.insertMany(tests.map((t) => ({ ...t, status: 'published' })));
  await M.AptitudeTest.create({ slug: 'draft-test', title: 'Draft', durationMinutes: 5, sections: [{ category: 'verbal', count: 2 }] });
  await M.AptitudeTest.create({ slug: 'closed-test', title: 'Closed', durationMinutes: 5, status: 'published', closesAt: new Date(Date.now() - 1000), sections: [{ category: 'verbal', count: 2 }] });
  const mk = async (name) => { const u = await User.collection.insertOne({ name, email: `${name}@x.com`, role: 'user' }); return jwt.sign({ id: String(u.insertedId) }, 'test-secret'); };
  const tokA = await mk('a');
  const tokB = await mk('b');

  const app = express();
  app.use(express.json());
  app.use('/api/aptitude/tests', require(path.join(SERVER, 'routes/aptitudeTestRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/aptitude/tests`;
  const call = async (method, url, body, token = tokA) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? `  (${extra})` : ''}`); };

  let r = await call('GET', '/', null, null);
  check('guests can list published tests', r.status === 200 && r.data.tests.length === 5 && !r.data.tests.some((t) => t.slug === 'draft-test'), r.data.tests?.length);
  check('closed test is marked closed', r.data.tests.find((t) => t.slug === 'closed-test').open === false);
  r = await call('POST', '/quant-quick-mock/start', null, null);
  check('starting needs sign-in', r.status === 401);
  r = await call('POST', '/closed-test/start');
  check('closed test cannot start', r.status === 403);
  r = await call('POST', '/draft-test/start');
  check('draft test cannot start', r.status === 404);

  const [s1, s2] = await Promise.all([call('POST', '/placement-mixed-mock/start'), call('POST', '/placement-mixed-mock/start')]);
  check('double start gives one attempt', s1.data.attemptId === s2.data.attemptId && (await M.AptitudeTestAttempt.countDocuments()) === 1);
  const id = s1.data.attemptId;
  r = await call('POST', '/placement-mixed-mock/start');
  check('start again resumes', r.data.resumed === true && r.data.attemptId === id);

  r = await call('GET', `/attempts/${id}`);
  const exam = r.data.exam;
  check('exam has 20 questions', exam && exam.items.length === 20, exam?.items.length);
  const leak = JSON.stringify(r.data).match(/"(answer|explanation|shortcut|correct|marks)"/);
  check('no answers leaked during the exam', !leak, leak?.[0]);
  check('deadline is 30 minutes after start', new Date(exam.deadline) - new Date(exam.startedAt) === 30 * 60000);
  r = await call('GET', `/attempts/${id}`, null, tokB);
  check('another student cannot open it', r.status === 404);

  const att = await M.AptitudeTestAttempt.findById(id).lean();
  const qs = await M.AptitudeQuestion.find({ _id: { $in: att.items.map((i) => i.question) } }).lean();
  const ans = new Map(qs.map((q) => [String(q._id), q.answer]));
  const right = (i) => att.items[i].order.indexOf(ans.get(String(att.items[i].question)));
  for (const i of [0, 1, 2]) await call('PATCH', `/attempts/${id}/items/${i}`, { selected: right(i), visited: true, seconds: 30 });
  await call('PATCH', `/attempts/${id}/items/3`, { selected: (right(3) + 1) % 4, review: true });
  await call('PATCH', `/attempts/${id}/items/4`, { selected: right(4) });
  r = await call('PATCH', `/attempts/${id}/items/4`, { selected: null });
  check('answer can be cleared', r.status === 200);
  r = await call('PATCH', `/attempts/${id}/items/5`, { selected: 9 });
  check('bad option refused', r.status === 400);
  r = await call('PATCH', `/attempts/${id}/items/99`, { selected: 0 });
  check('bad question refused', r.status === 404);
  r = await call('GET', `/attempts/${id}`);
  const it = r.data.exam.items;
  check('autosave survives a refresh', it[0].selected === right(0) && it[3].review === true && it[4].selected === null && it[0].seconds === 30);

  const [a, b] = await Promise.all([call('POST', `/attempts/${id}/submit`), call('POST', `/attempts/${id}/submit`)]);
  const res = a.data.result;
  check('score with negative marking', res.score === 2.75 && res.correctCount === 3 && res.wrongCount === 1 && res.skippedCount === 16, `${res.score} ${res.correctCount}/${res.wrongCount}/${res.skippedCount}`);
  check('double submit scores once', b.data.result.score === 2.75);
  check('xp 2 per correct on first attempt', res.xp === 6);
  const prog = await M.AptitudeProgress.findOne({ user: att.user }).lean();
  check('xp added once', prog.bonusXp === 6, prog?.bonusXp);
  check('result has solutions and topic breakdown', res.items[0].answer === right(0) && res.items[0].explanation && res.topics.length > 0);
  r = await call('PATCH', `/attempts/${id}/items/6`, { selected: 0 });
  check('no saving after submit', r.status === 409);

  const s3 = await call('POST', '/placement-mixed-mock/start');
  await M.AptitudeTestAttempt.updateOne({ _id: s3.data.attemptId }, { deadline: new Date(Date.now() - 60000) });
  r = await call('PATCH', `/attempts/${s3.data.attemptId}/items/0`, { selected: 0 });
  check('saving after the deadline is refused', r.status === 409);
  r = await call('GET', `/attempts/${s3.data.attemptId}`);
  check('overdue attempt is auto-submitted', r.data.result?.status === 'auto-submitted' && r.data.result.xp === 0);
  const s4 = await call('POST', '/placement-mixed-mock/start');
  await call('POST', `/attempts/${s4.data.attemptId}/submit`);
  r = await call('POST', '/placement-mixed-mock/start');
  check('max 3 attempts enforced', r.status === 403, r.data.message);
  r = await call('GET', '/attempts');
  check('previous tests listed', r.data.attempts.length === 3);
  r = await call('GET', '/placement-mixed-mock');
  check('test detail shows attempts used and best', r.data.test.attemptsUsed === 3 && r.data.test.bestScore === 2.75);

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
})().catch((e) => { console.error(e); process.exit(1); });
