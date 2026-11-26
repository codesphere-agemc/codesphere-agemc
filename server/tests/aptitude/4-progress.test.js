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
  await M.AptitudeAttempt.syncIndexes();
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await M.AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published' })));
  await M.AptitudeTest.insertMany(require(path.join(SERVER, 'data/aptitudeTests')).map((t) => ({ ...t, status: 'published' })));
  const u = await User.collection.insertOne({ name: 'a', email: 'a@x.com', role: 'user' });
  const tok = jwt.sign({ id: String(u.insertedId) }, 'test-secret');
  const u2 = await User.collection.insertOne({ name: 'b', email: 'b@x.com', role: 'user' });
  const tok2 = jwt.sign({ id: String(u2.insertedId) }, 'test-secret');

  const app = express();
  app.use(express.json());
  app.use('/api/aptitude/tests', require(path.join(SERVER, 'routes/aptitudeTestRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeProgressRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/aptitude`;
  const call = async (method, url, body, token = tok) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? `  (${extra})` : ''}`); };

  let r = await call('GET', '/analytics', null, null);
  check('analytics needs sign-in', r.status === 401);
  r = await call('GET', '/analytics');
  check('empty analytics works', r.status === 200 && r.data.activity.length === 30 && r.data.weak.length === 0 && r.data.categories.length === 4);

  // Practice: percentage 3 questions all wrong, profit-and-loss right.
  const pct = await M.AptitudeQuestion.find({ topic: 'percentage' }).lean();
  for (const q of pct) await call('POST', `/questions/${q._id}/answer`, { selected: (q.answer + 1) % 4, seconds: 20 });
  const pl = await M.AptitudeQuestion.find({ topic: 'profit-and-loss' }).lean();
  for (const q of pl) await call('POST', `/questions/${q._id}/answer`, { selected: q.answer, seconds: 40 });

  r = await call('GET', '/analytics');
  const a = r.data;
  const pTopic = a.topics.find((t) => t.slug === 'percentage');
  check('topic accuracy', pTopic.answered === pct.length && pTopic.accuracy === 0 && pTopic.avgSeconds === 20, JSON.stringify(pTopic));
  check('weak topics', a.weak[0]?.slug === 'percentage');
  check('strong topics', a.strong.some((t) => t.slug === 'profit-and-loss'));
  const quant = a.categories.find((c) => c.slug === 'quantitative');
  check('category totals', quant.answered === pct.length + pl.length && quant.topicsTried === 2, JSON.stringify(quant));
  check('today in activity', a.activity[29].answered === pct.length + pl.length);
  check('difficulty breakdown sums', a.difficulty.reduce((s, d) => s + d.answered, 0) === pct.length + pl.length);

  // A test: answer 2 wrong.
  const st = await call('POST', '/tests/verbal-ability-check/start');
  const att = await M.AptitudeTestAttempt.findById(st.data.attemptId).lean();
  const qs = await M.AptitudeQuestion.find({ _id: { $in: att.items.map((i) => i.question) } }).lean();
  const ans = new Map(qs.map((q) => [String(q._id), q.answer]));
  for (const i of [0, 1]) await call('PATCH', `/tests/attempts/${att._id}/items/${i}`, { selected: att.items[i].order.indexOf((ans.get(String(att.items[i].question)) + 1) % 4) });
  await call('POST', `/tests/attempts/${att._id}/submit`);
  r = await call('GET', '/analytics');
  check('test shows in trend', r.data.tests.length === 1 && r.data.tests[0].percent === 0);
  check('test answers count in categories', r.data.categories.find((c) => c.slug === 'verbal').answered === 2);

  r = await call('GET', '/mistakes');
  check('notebook has practice + test mistakes', r.data.open === pct.length + 2 && r.data.items.length === pct.length + 2, r.data.open);
  check('notebook shows solutions', r.data.items[0].explanation && Number.isInteger(r.data.items[0].answer));
  const first = r.data.items[0].id;
  r = await call('POST', `/mistakes/${first}`, { understood: true });
  check('mark understood', r.data.understood === true);
  r = await call('GET', '/mistakes');
  check('open list shrinks', r.data.open === pct.length + 1 && r.data.understood === 1 && !r.data.items.some((i) => i.id === first));
  r = await call('GET', '/mistakes?show=understood');
  check('understood list', r.data.items.length === 1 && r.data.items[0].id === first);
  r = await call('POST', `/mistakes/${first}`, { understood: false });
  check('undo understood', r.data.understood === false);
  r = await call('GET', `/mistakes?topic=percentage`);
  check('topic filter', r.data.items.length === pct.length && r.data.items.every((i) => i.topic === 'percentage'));
  await call('DELETE', `/mistakes/${first}`);
  r = await call('GET', '/mistakes?show=all');
  check('delete removes', !r.data.items.some((i) => i.id === first));
  r = await call('POST', `/mistakes/${pct[0]._id}`, { understood: true }, tok2);
  check("other student's notebook untouched", r.status === 404);

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
})().catch((e) => { console.error(e); process.exit(1); });
