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
  await M.AptitudeQuestion.syncIndexes();
  const { prepared } = require(path.join(SERVER, 'data/aptitudeQuestions'));
  await M.AptitudeQuestion.insertMany(prepared().map(({ verify, ...q }) => ({ ...q, status: 'published', source: 'codesphere' })));
  const bank = prepared();
  const inTopic = (t) => bank.filter((x) => x.topic === t).length;
  const pctNext = `QA-PCT-${String(Math.max(...bank.filter((x) => x.code.startsWith('QA-PCT-')).map((x) => Number(x.code.slice(-3)))) + 1).padStart(3, '0')}`;
  const mk = async (name, extra = {}) => { const u = await User.collection.insertOne({ name, email: `${name}@x.com`, role: 'user', ...extra }); return { id: u.insertedId, tok: jwt.sign({ id: String(u.insertedId) }, 'test-secret') }; };
  const ED = await mk('Editor', { staffRoles: ['aptitude-editor'] });
  const ST = await mk('Student');

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/aptitude/admin', require(path.join(SERVER, 'routes/aptitudeAdminRoutes')));
  app.use('/api/aptitude/tests', require(path.join(SERVER, 'routes/aptitudeTestRoutes')));
  app.use('/api/aptitude', require(path.join(SERVER, 'routes/aptitudeRoutes')));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/aptitude`;
  const call = async (method, url, body, token = ED.tok) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  let fails = 0;
  const check = (label, ok, extra = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? `  (${extra})` : ''}`); };

  let r = await call('GET', '/admin/questions', null, ST.tok);
  check('students are refused', r.status === 403);
  r = await call('GET', '/admin/questions?topic=percentage');
  check('editor lists questions with answers', r.status === 200 && r.data.total === inTopic('percentage') && Number.isInteger(r.data.questions[0].answer));
  r = await call('GET', '/admin/questions?q=QA-PL');
  check('search by code', r.data.total === bank.filter((x) => x.code.includes('QA-PL')).length, r.data.total);

  const good = { topic: 'Percentage', difficulty: 'easy', statement: 'What is 10% of 250?', options: ['25', '20', '30', '15'], answer: 'A', explanation: '250 × 0.1 = 25.' };
  r = await call('POST', '/admin/questions', { ...good, options: ['25', '25', '30'] });
  check('duplicate options refused', r.status === 400 && /same/.test(r.data.message));
  r = await call('POST', '/admin/questions', { ...good, answer: 'E' });
  check('answer outside options refused', r.status === 400);
  r = await call('POST', '/admin/questions', { ...good, topic: 'Astrology' });
  check('unknown topic refused', r.status === 400 && /Unknown topic/.test(r.data.message));
  r = await call('POST', '/admin/questions', good);
  const created = r.data.question;
  check('create with topic name, auto code', r.status === 201 && created.code === pctNext && created.status === 'draft' && created.topic === 'percentage', created?.code);
  r = await call('POST', '/admin/questions', { ...good, code: pctNext, statement: 'x?' });
  check('duplicate code refused', r.status === 409);
  r = await call('GET', '/practice?topic=percentage', null, ST.tok);
  check('draft hidden from students', r.data.total === inTopic('percentage'));
  r = await call('PUT', `/admin/questions/${created.id}`, { ...good, status: 'published', answer: 0 });
  check('edit + publish', r.data.question.status === 'published');
  r = await call('GET', '/practice?topic=percentage', null, ST.tok);
  check('published question visible to students', r.data.total === inTopic('percentage') + 1);

  const seeded = await M.AptitudeQuestion.findOne({ code: 'QA-PCT-001' }).lean();
  r = await call('PUT', `/admin/questions/${seeded._id}`, { ...seeded, explanation: 'Edited explanation.' });
  check('edited seed question marked so the seed keeps it', r.data.question.source === 'codesphere-edited');

  // Delete: unused → gone; used → archived
  r = await call('DELETE', `/admin/questions/${created.id}`);
  check('unused question deleted', r.data.deleted === true && !(await M.AptitudeQuestion.exists({ _id: created.id })));
  await call('POST', `/questions/${seeded._id}/answer`, { selected: 0 }, ST.tok);
  r = await call('DELETE', `/admin/questions/${seeded._id}`);
  check('answered question archived instead', r.data.archived === true && (await M.AptitudeQuestion.findById(seeded._id)).status === 'archived');

  // Import
  const rows = [
    { topic: 'ratio-and-proportion', difficulty: 'medium', question: 'A:B = 2:3 and B:C = 4:5. A:C?', optionA: '8:15', optionB: '2:5', optionC: '3:4', optionD: '6:5', answer: '1', explanation: 'A:C = 8:15.', tags: 'ratio|chain' },
    { topic: 'percentage', difficulty: 'easy', question: 'What is 10% of 250?', optionA: '25', optionB: '20', answer: 'A', explanation: 'dup text in file' },
    { topic: 'percentage', difficulty: 'easy', question: 'What is 10% of 250?', optionA: '25', optionB: '20', answer: 'A', explanation: 'second' },
    { code: 'QA-PL-001', topic: 'profit-and-loss', difficulty: 'easy', question: 'Existing code', optionA: 'x', optionB: 'y', answer: 'B', explanation: 'e' },
    { topic: 'Nonsense', question: '', answer: 'Z' },
  ];
  r = await call('POST', '/admin/questions/import', { questions: rows, dryRun: true, oneBasedNumbers: true });
  const acts = r.data.rows.map((x) => x.action).join(',');
  check('dry run report', acts === 'new,new,error,skip,error' && r.data.counts.new === 2, acts);
  check('1-based numeric answer read as A', r.data.rows[0].answer === 'A');
  check('errors are listed per row', r.data.rows[4].errors.length >= 3, r.data.rows[4].errors.join(' | '));
  check('dry run writes nothing', !(await M.AptitudeQuestion.exists({ statement: rows[0].question })));
  r = await call('POST', '/admin/questions/import', { questions: rows, dryRun: false, oneBasedNumbers: true, mode: 'update' });
  check('import saves new + updates existing', r.data.counts.new === 2 && r.data.counts.update === 1);
  const imp = await M.AptitudeQuestion.findOne({ statement: rows[0].question }).lean();
  check('imported as draft with code and tags', imp.status === 'draft' && /^QA-RP-\d{3}$/.test(imp.code) && imp.tags.join() === 'ratio,chain', `${imp.code} ${imp.tags}`);
  r = await call('POST', '/admin/questions/import', { questions: rows.slice(0, 1), dryRun: true });
  check('re-import without code is skipped as same text', r.data.rows[0].action === 'skip');
  r = await call('POST', '/admin/questions/status', { ids: [String(imp._id)], status: 'published' });
  check('bulk publish', r.data.updated === 1);

  // Tests
  r = await call('POST', '/admin/tests', { title: 'Ratio Drill', durationMinutes: 10, questionCodes: 'QA-RP-001, QA-NOPE-001' });
  check('unknown codes refused', r.status === 400 && /QA-NOPE-001/.test(r.data.message));
  r = await call('POST', '/admin/tests', { title: 'Ratio Drill', durationMinutes: 10, questionCodes: ['QA-RP-001', 'QA-RP-002', imp.code], negativeMarks: 0.5, status: 'published', maxAttempts: 2 });
  const t = r.data.test;
  check('fixed-question test created', r.status === 201 && t.slug === 'ratio-drill' && t.questionCodes.length === 3);
  r = await call('POST', '/admin/tests', { title: 'Mixed', durationMinutes: 20, sections: [{ category: 'logical', count: 5 }, { category: 'verbal', count: 0 }] });
  check('bad section count refused', r.status === 400);
  r = await call('POST', '/admin/tests', { title: 'Ratio Drill', durationMinutes: 20, sections: [{ category: 'logical', count: 5 }] });
  check('same title gets a unique link', r.status === 201 && r.data.test.slug !== 'ratio-drill' && r.data.test.sections[0].name === 'Logical Reasoning');
  const draftId = r.data.test.id;
  r = await call('POST', '/tests/ratio-drill/start', null, ST.tok);
  check('student can take the new test', r.status === 201);
  r = await call('GET', '/admin/tests');
  const row = r.data.tests.find((x) => x.slug === 'ratio-drill');
  check('test list shows attempts', row.attempts === 1 && row.students === 1);
  r = await call('DELETE', `/admin/tests/${t.id}`);
  check('taken test archived not deleted', r.data.archived === true);
  r = await call('DELETE', `/admin/tests/${draftId}`);
  check('untaken test deleted', r.data.deleted === true);
  r = await call('PUT', `/admin/tests/${t.id}`, { ...t, title: 'Ratio Drill v2', slug: 'ratio-drill', status: 'published' });
  check('edit test', r.data.test.title === 'Ratio Drill v2');

  r = await call('GET', '/admin/stats');
  check('stats', r.data.status.published > 100 && r.data.week.answers === 1 && r.data.categories.length === 4 && r.data.categories.every((c) => Array.isArray(c.emptyTopics)));

  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
})().catch((e) => { console.error(e); process.exit(1); });
