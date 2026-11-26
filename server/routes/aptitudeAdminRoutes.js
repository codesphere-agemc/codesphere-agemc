// Aptitude admin: question bank, bulk import, mock tests and usage numbers.
// Open to admins and students with the aptitude-editor staff role.
const express = require('express');
const mongoose = require('mongoose');
const { CATEGORIES, DIFFICULTIES, topicIndex } = require('../data/aptitudeTopics');
const {
  AptitudeQuestion, AptitudeAttempt, AptitudeTest, AptitudeTestAttempt, AptitudeDailyAttempt, AptitudeDaily,
} = require('../models/Aptitude');
const { protect, requireStaff } = require('../middleware/authMiddleware');
const { validateQuestion, nextCode, STATUSES } = require('../utils/aptitudeValidate');

const router = express.Router();
router.use(protect, requireStaff('aptitude-editor'));

const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const PAGE = 50;
const MAX_IMPORT = 1000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fail = (res, status, message, extra = {}) => res.status(status).json({ message, ...extra });

// ---------- Questions ----------

router.get('/questions', async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = String(req.query.category);
  if (req.query.topic) filter.topic = String(req.query.topic);
  if (DIFFICULTIES.includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) filter.$or = [{ code: { $regex: escapeRe(q), $options: 'i' } }, { statement: { $regex: escapeRe(q), $options: 'i' } }, { tags: q.toLowerCase() }];
  const page = Math.max(1, Number(req.query.page) || 1);
  const [total, rows] = await Promise.all([
    AptitudeQuestion.countDocuments(filter),
    AptitudeQuestion.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
  ]);
  // How students did on these questions.
  const usage = await AptitudeAttempt.aggregate([
    { $match: { question: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$question', answers: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } } } },
  ]);
  const byId = new Map(usage.map((u) => [String(u._id), u]));
  res.json({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    questions: rows.map((r) => {
      const u = byId.get(String(r._id));
      return { ...r, id: String(r._id), topicName: topicIndex.get(r.topic)?.name || r.topic, answers: u?.answers || 0, accuracy: u?.answers ? Math.round((u.correct / u.answers) * 100) : null };
    }),
  });
});

router.get('/questions/:id', async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Question not found.');
  const q = await AptitudeQuestion.findById(req.params.id).lean();
  if (!q) return fail(res, 404, 'Question not found.');
  res.json({ question: { ...q, id: String(q._id) } });
});

async function codeIsFree(code, exceptId) {
  const clash = await AptitudeQuestion.findOne({ code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('_id').lean();
  return !clash;
}

router.post('/questions', async (req, res) => {
  const { value, errors } = validateQuestion(req.body, { defaultStatus: 'draft' });
  if (errors.length) return fail(res, 400, errors[0], { errors });
  if (value.code && !(await codeIsFree(value.code))) return fail(res, 409, `Code ${value.code} is already used.`);
  if (!value.code) value.code = await nextCode(AptitudeQuestion, value.topic);
  try {
    const q = await AptitudeQuestion.create({ ...value, source: 'admin', createdBy: req.user._id });
    res.status(201).json({ question: { ...q.toObject(), id: String(q._id) } });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, 'That code was just taken. Save again to get a new one.');
    throw error;
  }
});

router.put('/questions/:id', async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Question not found.');
  const existing = await AptitudeQuestion.findById(req.params.id).lean();
  if (!existing) return fail(res, 404, 'Question not found.');
  const { value, errors } = validateQuestion({ code: existing.code, ...req.body }, { defaultStatus: existing.status });
  if (errors.length) return fail(res, 400, errors[0], { errors });
  if (value.code !== existing.code && !(await codeIsFree(value.code, existing._id))) return fail(res, 409, `Code ${value.code} is already used.`);
  // An edited seeded question is marked so the seed script won't overwrite it.
  const source = existing.source === 'codesphere' ? 'codesphere-edited' : existing.source;
  const q = await AptitudeQuestion.findByIdAndUpdate(existing._id, { $set: { ...value, source } }, { returnDocument: 'after', runValidators: true }).lean();
  res.json({ question: { ...q, id: String(q._id) } });
});

// Delete if nobody has answered it; otherwise archive (keeps students' history intact).
router.delete('/questions/:id', async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Question not found.');
  const id = new mongoose.Types.ObjectId(req.params.id);
  const used = await Promise.all([
    AptitudeAttempt.exists({ question: id }),
    AptitudeTestAttempt.exists({ 'items.question': id }),
    AptitudeTest.exists({ questions: id }),
    AptitudeDaily.exists({ questions: id }),
  ]);
  if (used.some(Boolean)) {
    const q = await AptitudeQuestion.findByIdAndUpdate(id, { status: 'archived' }, { returnDocument: 'after' }).lean();
    if (!q) return fail(res, 404, 'Question not found.');
    return res.json({ archived: true, message: 'Students have already answered this question, so it was archived instead of deleted.' });
  }
  const r = await AptitudeQuestion.deleteOne({ _id: id });
  if (!r.deletedCount) return fail(res, 404, 'Question not found.');
  res.json({ deleted: true });
});

// Change the status of many questions at once.
router.post('/questions/status', async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter(isId).slice(0, 500);
  const status = req.body?.status;
  if (!ids.length || !STATUSES.includes(status)) return fail(res, 400, 'Pick questions and a status.');
  const r = await AptitudeQuestion.updateMany({ _id: { $in: ids } }, { $set: { status } });
  res.json({ updated: r.modifiedCount });
});

// Bulk import. dryRun: true only checks and returns a per-row report.
// mode: 'skip' leaves existing codes alone, 'update' overwrites them.
router.post('/questions/import', async (req, res) => {
  const rows = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (!rows.length) return fail(res, 400, 'No questions found in the file.');
  if (rows.length > MAX_IMPORT) return fail(res, 400, `Import at most ${MAX_IMPORT} questions at a time.`);
  const mode = req.body.mode === 'update' ? 'update' : 'skip';
  const dryRun = req.body.dryRun !== false;
  const oneBased = Boolean(req.body.oneBasedNumbers);
  const defaultStatus = STATUSES.includes(req.body.defaultStatus) ? req.body.defaultStatus : 'draft';

  const checked = rows.map((row, i) => ({ row: i + 1, ...validateQuestion(row, { oneBasedNumbers: oneBased, defaultStatus }) }));
  const codes = checked.map((c) => c.value.code).filter(Boolean);
  const existing = new Set((await AptitudeQuestion.find({ code: { $in: codes } }).select('code').lean()).map((q) => q.code));
  // Same statement already in the bank (catches re-imports without codes).
  const statements = checked.map((c) => c.value.statement).filter(Boolean);
  const sameText = new Map((await AptitudeQuestion.find({ statement: { $in: statements } }).select('statement code').lean()).map((q) => [q.statement, q.code]));

  const seenCodes = new Set();
  const seenText = new Set();
  const taken = new Set([...existing]);
  const report = [];
  for (const c of checked) {
    const v = c.value;
    const errors = [...c.errors];
    if (v.code && seenCodes.has(v.code)) errors.push(`Code ${v.code} appears twice in the file.`);
    if (v.statement && seenText.has(v.statement)) errors.push('Same question text appears twice in the file.');
    if (v.code) seenCodes.add(v.code);
    if (v.statement) seenText.add(v.statement);
    let action = 'new';
    if (errors.length) action = 'error';
    else if (v.code && existing.has(v.code)) action = mode === 'update' ? 'update' : 'skip';
    else if (!v.code && sameText.has(v.statement)) action = 'skip';
    if (action === 'new' && !v.code) {
      v.code = await nextCode(AptitudeQuestion, v.topic, taken);
    }
    if (v.code) taken.add(v.code);
    report.push({
      row: c.row,
      action,
      code: v.code,
      topic: v.topic ? topicIndex.get(v.topic).name : '',
      difficulty: v.difficulty,
      statement: v.statement.slice(0, 140),
      options: v.options.length,
      answer: v.answer >= 0 ? String.fromCharCode(65 + v.answer) : '',
      errors,
      note: action === 'skip' ? (existing.has(v.code) ? 'Code already in the bank.' : `Same text as ${sameText.get(v.statement)}.`) : '',
      value: v,
    });
  }
  const counts = { new: 0, update: 0, skip: 0, error: 0 };
  report.forEach((r) => { counts[r.action] += 1; });

  if (!dryRun) {
    const ops = report.filter((r) => r.action === 'new' || r.action === 'update').map((r) => (r.action === 'new'
      ? { insertOne: { document: { ...r.value, source: 'import', createdBy: req.user._id } } }
      : { updateOne: { filter: { code: r.value.code }, update: { $set: { ...r.value, source: 'import' } } } }));
    if (ops.length) await AptitudeQuestion.bulkWrite(ops, { ordered: false });
  }
  res.json({ dryRun, counts, rows: report.map(({ value, ...r }) => r) });
});

// ---------- Mock tests ----------

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const KINDS = ['topic', 'section', 'mixed', 'full', 'placement', 'custom'];

async function cleanTest(body, current) {
  const errors = [];
  const title = String(body.title || '').trim();
  if (!title) errors.push('Title is required.');
  const durationMinutes = Number(body.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) errors.push('Duration must be 1 to 360 minutes.');
  const marksPerQuestion = Number(body.marksPerQuestion ?? 1);
  const negativeMarks = Number(body.negativeMarks ?? 0);
  if (!(marksPerQuestion >= 0 && marksPerQuestion <= 20) || !(negativeMarks >= 0 && negativeMarks <= 20)) errors.push('Marks must be between 0 and 20.');
  const maxAttempts = Number(body.maxAttempts ?? 1);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 50) errors.push('Attempts must be 0 (unlimited) to 50.');

  // Questions: a fixed list of codes, or random sections.
  let questions = [];
  const codes = (Array.isArray(body.questionCodes) ? body.questionCodes : String(body.questionCodes || '').split(/[\s,]+/))
    .map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (codes.length) {
    const found = await AptitudeQuestion.find({ code: { $in: codes } }).select('code status').lean();
    const byCode = new Map(found.map((q) => [q.code, q]));
    const missing = codes.filter((c) => !byCode.has(c));
    if (missing.length) errors.push(`Unknown question codes: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    questions = [...new Set(codes)].map((c) => byCode.get(c)?._id).filter(Boolean);
  }
  const sections = (Array.isArray(body.sections) ? body.sections : []).map((s) => ({
    name: String(s.name || '').trim().slice(0, 80),
    category: CATEGORIES.some((c) => c.slug === s.category) ? s.category : '',
    topics: (Array.isArray(s.topics) ? s.topics : []).filter((t) => topicIndex.has(t)),
    count: Number(s.count),
    difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : '',
  }));
  if (!codes.length) {
    if (!sections.length) errors.push('Add at least one section, or list question codes.');
    sections.forEach((s, i) => {
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > 200) errors.push(`Section ${i + 1}: question count must be 1 to 200.`);
      if (!s.name) s.name = CATEGORIES.find((c) => c.slug === s.category)?.name || `Section ${i + 1}`;
    });
  }
  const opensAt = body.opensAt ? new Date(body.opensAt) : null;
  const closesAt = body.closesAt ? new Date(body.closesAt) : null;
  if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime()))) errors.push('Check the open and close dates.');
  else if (opensAt && closesAt && closesAt <= opensAt) errors.push('Close time must be after open time.');

  let slug = slugify(body.slug || title);
  if (!slug) errors.push('Give the test a title with letters or numbers.');
  else {
    const clash = await AptitudeTest.findOne({ slug, ...(current ? { _id: { $ne: current._id } } : {}) }).select('_id').lean();
    if (clash) {
      if (body.slug) errors.push(`The link name "${slug}" is already used.`);
      else slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }
  }
  return {
    errors,
    value: {
      slug,
      title,
      description: String(body.description || '').trim().slice(0, 3000),
      kind: KINDS.includes(body.kind) ? body.kind : 'mixed',
      track: String(body.track || ''),
      questions,
      sections: codes.length ? [] : sections,
      durationMinutes,
      marksPerQuestion,
      negativeMarks,
      shuffleQuestions: body.shuffleQuestions !== false,
      shuffleOptions: Boolean(body.shuffleOptions),
      maxAttempts,
      opensAt,
      closesAt,
      status: STATUSES.includes(body.status) ? body.status : 'draft',
    },
  };
}

const testOut = async (t) => {
  const codes = t.questions?.length ? (await AptitudeQuestion.find({ _id: { $in: t.questions } }).select('code').lean()).map((q) => q.code) : [];
  return { ...t, id: String(t._id), questionCodes: codes };
};

router.get('/tests', async (req, res) => {
  const tests = await AptitudeTest.find().sort({ createdAt: -1 }).lean();
  const counts = await AptitudeTestAttempt.aggregate([
    { $group: { _id: '$test', attempts: { $sum: 1 }, students: { $addToSet: '$user' }, avg: { $avg: { $cond: [{ $gt: ['$maxScore', 0] }, { $divide: ['$score', '$maxScore'] }, null] } } } },
  ]);
  const byTest = new Map(counts.map((c) => [String(c._id), c]));
  res.json({
    tests: await Promise.all(tests.map(async (t) => {
      const c = byTest.get(String(t._id));
      return { ...(await testOut(t)), attempts: c?.attempts || 0, students: c?.students.length || 0, averagePercent: c?.avg != null ? Math.round(c.avg * 100) : null };
    })),
  });
});

router.post('/tests', async (req, res) => {
  const { value, errors } = await cleanTest(req.body || {});
  if (errors.length) return fail(res, 400, errors[0], { errors });
  const t = await AptitudeTest.create({ ...value, createdBy: req.user._id });
  res.status(201).json({ test: await testOut(t.toObject()) });
});

router.put('/tests/:id', async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Test not found.');
  const current = await AptitudeTest.findById(req.params.id).lean();
  if (!current) return fail(res, 404, 'Test not found.');
  const { value, errors } = await cleanTest(req.body || {}, current);
  if (errors.length) return fail(res, 400, errors[0], { errors });
  // Attempts already started keep their frozen questions, marks and deadline.
  const t = await AptitudeTest.findByIdAndUpdate(current._id, { $set: value }, { returnDocument: 'after', runValidators: true }).lean();
  res.json({ test: await testOut(t) });
});

router.delete('/tests/:id', async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Test not found.');
  if (await AptitudeTestAttempt.exists({ test: req.params.id })) {
    await AptitudeTest.updateOne({ _id: req.params.id }, { status: 'archived' });
    return res.json({ archived: true, message: 'Students have taken this test, so it was archived (hidden) instead of deleted.' });
  }
  const r = await AptitudeTest.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return fail(res, 404, 'Test not found.');
  res.json({ deleted: true });
});

// ---------- Usage numbers ----------

router.get('/stats', async (req, res) => {
  const since = new Date(Date.now() - 7 * 86400000);
  const [byStatus, byCatDiff, answers7, students7, tests7, daily7, hardest, perTopic] = await Promise.all([
    AptitudeQuestion.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    AptitudeQuestion.aggregate([{ $match: { status: 'published' } }, { $group: { _id: { c: '$category', d: '$difficulty' }, n: { $sum: 1 } } }]),
    AptitudeAttempt.countDocuments({ createdAt: { $gte: since } }),
    AptitudeAttempt.distinct('user', { createdAt: { $gte: since } }),
    AptitudeTestAttempt.countDocuments({ submittedAt: { $gte: since } }),
    AptitudeDailyAttempt.countDocuments({ submittedAt: { $gte: since } }),
    AptitudeAttempt.aggregate([
      { $group: { _id: '$question', answers: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } } } },
      { $match: { answers: { $gte: 5 } } },
      { $project: { answers: 1, accuracy: { $divide: ['$correct', '$answers'] } } },
      { $sort: { accuracy: 1 } },
      { $limit: 10 },
      { $lookup: { from: 'aptitudequestions', localField: '_id', foreignField: '_id', as: 'q', pipeline: [{ $project: { code: 1, statement: 1, topic: 1 } }] } },
      { $unwind: '$q' },
    ]),
    AptitudeQuestion.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$topic', n: { $sum: 1 } } }]),
  ]);
  const status = Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((x) => x._id === s)?.n || 0]));
  const topicCount = new Map(perTopic.map((t) => [t._id, t.n]));
  res.json({
    status,
    categories: CATEGORIES.map((c) => ({
      slug: c.slug,
      name: c.name,
      byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, byCatDiff.find((x) => x._id.c === c.slug && x._id.d === d)?.n || 0])),
      emptyTopics: c.topics.filter((t) => !topicCount.get(t.slug)).map((t) => ({ slug: t.slug, name: t.name })),
    })),
    week: { answers: answers7, students: students7.length, tests: tests7, dailies: daily7 },
    hardest: hardest.map((h) => ({ id: String(h._id), code: h.q.code, statement: h.q.statement.slice(0, 120), topicName: topicIndex.get(h.q.topic)?.name || h.q.topic, answers: h.answers, accuracy: Math.round(h.accuracy * 100) })),
  });
});

module.exports = router;
