// Aptitude mock tests: the exam engine.
// Questions and option order are frozen when an attempt starts. The deadline
// comes from the server clock, answers are refused after it, and scoring is
// done here. Answers and explanations are only sent once an attempt is over.
const express = require('express');
const mongoose = require('mongoose');
const { topicIndex } = require('../data/aptitudeTopics');
const { AptitudeQuestion, AptitudeTest, AptitudeTestAttempt, AptitudeProgress } = require('../models/Aptitude');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { newBadgesFor } = require('./aptitudeRoutes');

const router = express.Router();
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const GRACE_MS = 5000; // network slack for a save sent just before time runs out
const XP_PER_CORRECT = 2; // first attempt of each test only

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const isOpen = (t, now = new Date()) => (!t.opensAt || t.opensAt <= now) && (!t.closesAt || t.closesAt > now);

function testCard(t, mine = []) {
  const done = mine.filter((a) => a.status !== 'in-progress');
  const best = done.reduce((m, a) => (m == null || a.score > m ? a.score : m), null);
  const questionCount = t.questions?.length || t.sections.reduce((s, x) => s + (x.count || 0), 0);
  return {
    id: String(t._id),
    slug: t.slug,
    title: t.title,
    description: t.description,
    kind: t.kind,
    track: t.track,
    questionCount,
    durationMinutes: t.durationMinutes,
    marksPerQuestion: t.marksPerQuestion,
    negativeMarks: t.negativeMarks,
    maxAttempts: t.maxAttempts,
    opensAt: t.opensAt,
    closesAt: t.closesAt,
    open: isOpen(t),
    sections: t.sections.map((s) => ({ name: s.name, category: s.category, count: s.count })),
    attemptsUsed: mine.length,
    inProgress: mine.find((a) => a.status === 'in-progress')?._id || null,
    bestScore: best,
    lastAttempt: done[0]?._id || null,
  };
}

// Pick the questions for one sitting.
async function drawQuestions(test) {
  if (test.questions?.length) {
    const found = await AptitudeQuestion.find({ _id: { $in: test.questions }, status: 'published' }).select('_id options').lean();
    const byId = new Map(found.map((q) => [String(q._id), q]));
    const list = test.questions.map((id) => byId.get(String(id))).filter(Boolean);
    return test.shuffleQuestions ? shuffle(list) : list;
  }
  const picked = [];
  const seen = new Set();
  for (const s of test.sections) {
    const match = { status: 'published' };
    if (s.category) match.category = s.category;
    if (s.topics?.length) match.topic = { $in: s.topics };
    if (s.difficulty) match.difficulty = s.difficulty;
    if (seen.size) match._id = { $nin: [...seen].map((id) => new mongoose.Types.ObjectId(id)) };
    const rows = await AptitudeQuestion.aggregate([{ $match: match }, { $sample: { size: s.count || 10 } }, { $project: { options: 1 } }]);
    rows.forEach((q) => seen.add(String(q._id)));
    picked.push(...rows); // sections stay in order; questions inside are already random
  }
  return picked;
}

// Score an attempt from the stored answers. Pure: the same input always gives the same result.
async function scoreOf(attempt) {
  const qs = await AptitudeQuestion.find({ _id: { $in: attempt.items.map((i) => i.question) } }).select('answer').lean();
  const answers = new Map(qs.map((q) => [String(q._id), q.answer]));
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  const items = attempt.items.map((it) => {
    const plain = it.toObject ? it.toObject() : { ...it };
    if (plain.selected == null) {
      skippedCount += 1;
      return { ...plain, correct: false, marks: 0 };
    }
    const correct = plain.selected === answers.get(String(plain.question));
    const marks = correct ? attempt.marksPerQuestion : -attempt.negativeMarks;
    score += marks;
    if (correct) correctCount += 1;
    else wrongCount += 1;
    return { ...plain, correct, marks };
  });
  return {
    items,
    score: Math.round(score * 100) / 100,
    maxScore: attempt.items.length * attempt.marksPerQuestion,
    correctCount,
    wrongCount,
    skippedCount,
  };
}

// Close an attempt exactly once. Safe to call from several requests at the same time.
async function finalize(attempt, status) {
  if (attempt.status !== 'in-progress') return attempt;
  const result = await scoreOf(attempt);
  const xp = attempt.number === 1 ? result.correctCount * XP_PER_CORRECT : 0;
  const done = await AptitudeTestAttempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in-progress' },
    { $set: { ...result, xp, status, submittedAt: status === 'auto-submitted' ? attempt.deadline : new Date() } },
    { returnDocument: 'after' },
  );
  if (!done) return AptitudeTestAttempt.findById(attempt._id); // another request finished it first
  // Wrong answers go into the mistake notebook (once each); XP is added once.
  const wrong = result.items.filter((it) => it.selected != null && !it.correct).map((it) => String(it.question));
  const progress = await AptitudeProgress.findOne({ user: attempt.user }).select('mistakes').lean();
  const have = new Set((progress?.mistakes || []).map((m) => String(m.question)));
  const fresh = [...new Set(wrong)].filter((id) => !have.has(id)).map((id) => ({ question: id, at: new Date() }));
  const update = {};
  if (xp) update.$inc = { bonusXp: xp };
  if (fresh.length) update.$push = { mistakes: { $each: fresh } };
  if (Object.keys(update).length) await AptitudeProgress.updateOne({ user: attempt.user }, update, { upsert: true });
  return done;
}

const overdue = (a, now = Date.now()) => a.status === 'in-progress' && a.deadline.getTime() + GRACE_MS < now;

// Finish any of this student's attempts whose time ran out while they were away.
async function closeOverdue(userId) {
  const stale = await AptitudeTestAttempt.find({ user: userId, status: 'in-progress', deadline: { $lt: new Date(Date.now() - GRACE_MS) } });
  await Promise.all(stale.map((a) => finalize(a, 'auto-submitted')));
}

async function ownAttempt(req, res) {
  if (!isId(req.params.id)) {
    res.status(404).json({ message: 'Attempt not found.' });
    return null;
  }
  let attempt = await AptitudeTestAttempt.findOne({ _id: req.params.id, user: req.user._id });
  if (!attempt) {
    res.status(404).json({ message: 'Attempt not found.' });
    return null;
  }
  if (overdue(attempt)) attempt = await finalize(attempt, 'auto-submitted');
  return attempt;
}

// The exam screen: questions in this student's option order, no answers.
async function examView(attempt) {
  const test = await AptitudeTest.findById(attempt.test).select('title slug durationMinutes').lean();
  const qs = await AptitudeQuestion.find({ _id: { $in: attempt.items.map((i) => i.question) } })
    .select('code statement options category topic difficulty').lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  return {
    id: String(attempt._id),
    status: attempt.status,
    test: test && { title: test.title, slug: test.slug, durationMinutes: test.durationMinutes },
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    serverNow: new Date(),
    marksPerQuestion: attempt.marksPerQuestion,
    negativeMarks: attempt.negativeMarks,
    items: attempt.items.map((it) => {
      const q = byId.get(String(it.question)) || { options: [] };
      return {
        code: q.code,
        statement: q.statement || 'This question is no longer available.',
        options: it.order.map((o) => q.options[o]),
        category: q.category,
        topicName: topicIndex.get(q.topic)?.name || q.topic,
        selected: it.selected == null ? null : it.order.indexOf(it.selected),
        review: it.review,
        visited: it.visited,
        seconds: it.seconds,
      };
    }),
  };
}

// The result: score, per-topic breakdown and full solutions.
async function resultView(attempt) {
  const test = await AptitudeTest.findById(attempt.test).select('title slug maxAttempts').lean();
  const qs = await AptitudeQuestion.find({ _id: { $in: attempt.items.map((i) => i.question) } })
    .select('code statement options answer explanation shortcut category topic difficulty').lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const topics = new Map();
  const items = attempt.items.map((it) => {
    const q = byId.get(String(it.question)) || { options: [] };
    const name = topicIndex.get(q.topic)?.name || q.topic || 'Other';
    const t = topics.get(name) || { topic: name, total: 0, correct: 0, wrong: 0 };
    t.total += 1;
    if (it.correct) t.correct += 1;
    else if (it.selected != null) t.wrong += 1;
    topics.set(name, t);
    const shown = (i) => (i == null ? null : it.order.indexOf(i));
    return {
      code: q.code,
      statement: q.statement,
      options: it.order.map((o) => q.options[o]),
      topicName: name,
      difficulty: q.difficulty,
      selected: shown(it.selected),
      answer: shown(q.answer),
      correct: Boolean(it.correct),
      marks: it.marks || 0,
      review: it.review,
      seconds: it.seconds,
      explanation: q.explanation,
      shortcut: q.shortcut,
    };
  });
  const timeTaken = Math.max(0, Math.round(((attempt.submittedAt || attempt.deadline) - attempt.startedAt) / 1000));
  return {
    id: String(attempt._id),
    status: attempt.status,
    number: attempt.number,
    test: test && { title: test.title, slug: test.slug },
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    timeTaken,
    score: attempt.score,
    maxScore: attempt.maxScore,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    skippedCount: attempt.skippedCount,
    accuracy: attempt.correctCount + attempt.wrongCount ? Math.round((attempt.correctCount / (attempt.correctCount + attempt.wrongCount)) * 100) : 0,
    xp: attempt.xp,
    topics: [...topics.values()],
    items,
  };
}

// ---------- Routes ----------

router.get('/', optionalAuth, async (req, res) => {
  const tests = await AptitudeTest.find({ status: 'published' }).sort({ createdAt: -1 }).lean();
  let mine = [];
  if (req.user) {
    await closeOverdue(req.user._id);
    mine = await AptitudeTestAttempt.find({ user: req.user._id }).select('test status score').sort({ createdAt: -1 }).lean();
  }
  res.json({ tests: tests.map((t) => testCard(t, mine.filter((a) => String(a.test) === String(t._id)))) });
});

// This student's finished attempts, newest first.
router.get('/attempts', protect, async (req, res) => {
  await closeOverdue(req.user._id);
  const rows = await AptitudeTestAttempt.find({ user: req.user._id, status: { $ne: 'in-progress' } })
    .sort({ submittedAt: -1 }).limit(100).populate('test', 'title slug').lean();
  res.json({
    attempts: rows.map((a) => ({
      id: String(a._id),
      test: a.test && { title: a.test.title, slug: a.test.slug },
      number: a.number,
      status: a.status,
      submittedAt: a.submittedAt,
      score: a.score,
      maxScore: a.maxScore,
      correctCount: a.correctCount,
      wrongCount: a.wrongCount,
      skippedCount: a.skippedCount,
      questions: a.items.length,
    })),
  });
});

router.get('/attempts/:id', protect, async (req, res) => {
  const attempt = await ownAttempt(req, res);
  if (!attempt) return;
  res.json(attempt.status === 'in-progress' ? { exam: await examView(attempt) } : { result: await resultView(attempt) });
});

// Autosave one answer. Refused once the attempt is over.
router.patch('/attempts/:id/items/:index', protect, async (req, res) => {
  const attempt = await ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status !== 'in-progress') return res.status(409).json({ message: 'This test has already been submitted.', status: attempt.status });
  const index = Number(req.params.index);
  const item = Number.isInteger(index) ? attempt.items[index] : null;
  if (!item) return res.status(404).json({ message: 'Question not found.' });

  const set = {};
  const { selected, review, visited, seconds } = req.body || {};
  if (selected === null) set[`items.${index}.selected`] = null;
  else if (selected !== undefined) {
    if (!Number.isInteger(selected) || selected < 0 || selected >= item.order.length) return res.status(400).json({ message: 'Pick one of the options.' });
    set[`items.${index}.selected`] = item.order[selected];
  }
  if (typeof review === 'boolean') set[`items.${index}.review`] = review;
  if (visited === true) set[`items.${index}.visited`] = true;
  if (Number.isFinite(seconds) && seconds >= 0) set[`items.${index}.seconds`] = Math.min(Math.round(seconds), 6 * 3600);

  const saved = await AptitudeTestAttempt.updateOne(
    { _id: attempt._id, status: 'in-progress', deadline: { $gt: new Date(Date.now() - GRACE_MS) } },
    { $set: set },
  );
  if (!saved.modifiedCount && !saved.matchedCount) return res.status(409).json({ message: 'Time is up. Your test has been submitted.' });
  res.json({ ok: true, serverNow: new Date() });
});

router.post('/attempts/:id/submit', protect, async (req, res) => {
  const attempt = await ownAttempt(req, res);
  if (!attempt) return;
  const done = await finalize(attempt, 'submitted');
  res.json({ result: await resultView(done), badges: await newBadgesFor(req.user._id) });
});

router.get('/:slug', optionalAuth, async (req, res) => {
  const test = await AptitudeTest.findOne({ slug: String(req.params.slug).toLowerCase(), status: 'published' }).lean();
  if (!test) return res.status(404).json({ message: 'Test not found.' });
  let mine = [];
  if (req.user) {
    await closeOverdue(req.user._id);
    mine = await AptitudeTestAttempt.find({ user: req.user._id, test: test._id })
      .select('test status score maxScore number submittedAt').sort({ createdAt: -1 }).lean();
  }
  res.json({
    test: testCard(test, mine),
    attempts: mine.filter((a) => a.status !== 'in-progress').map((a) => ({
      id: String(a._id), number: a.number, score: a.score, maxScore: a.maxScore, submittedAt: a.submittedAt, status: a.status,
    })),
  });
});

// Start (or resume) a sitting.
router.post('/:slug/start', protect, async (req, res) => {
  const test = await AptitudeTest.findOne({ slug: String(req.params.slug).toLowerCase(), status: 'published' });
  if (!test) return res.status(404).json({ message: 'Test not found.' });
  await closeOverdue(req.user._id);

  const running = await AptitudeTestAttempt.findOne({ user: req.user._id, test: test._id, status: 'in-progress' });
  if (running) return res.json({ attemptId: String(running._id), resumed: true });

  if (!isOpen(test)) return res.status(403).json({ message: 'This test is not open right now.' });
  const used = await AptitudeTestAttempt.countDocuments({ user: req.user._id, test: test._id });
  if (test.maxAttempts && used >= test.maxAttempts) return res.status(403).json({ message: `You have used all ${test.maxAttempts} attempt${test.maxAttempts === 1 ? '' : 's'} for this test.` });

  const questions = await drawQuestions(test);
  if (!questions.length) return res.status(409).json({ message: 'This test has no questions yet.' });

  const startedAt = new Date();
  try {
    const attempt = await AptitudeTestAttempt.create({
      test: test._id,
      user: req.user._id,
      number: used + 1,
      startedAt,
      deadline: new Date(startedAt.getTime() + test.durationMinutes * 60000),
      marksPerQuestion: test.marksPerQuestion,
      negativeMarks: test.negativeMarks,
      items: questions.map((q) => {
        const order = q.options.map((_, i) => i);
        return { question: q._id, order: test.shuffleOptions ? shuffle(order) : order };
      }),
    });
    res.status(201).json({ attemptId: String(attempt._id), resumed: false });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Two start clicks at once: hand back the one that won.
    const won = await AptitudeTestAttempt.findOne({ user: req.user._id, test: test._id, status: 'in-progress' });
    if (!won) return res.status(409).json({ message: 'Please try again.' });
    res.json({ attemptId: String(won._id), resumed: true });
  }
});

module.exports = router;
