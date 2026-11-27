// Aptitude analytics (my progress) and the mistake notebook.
const express = require('express');
const mongoose = require('mongoose');
const { CATEGORIES, DIFFICULTIES, topicIndex } = require('../data/aptitudeTopics');
const { AptitudeQuestion, AptitudeAttempt, AptitudeProgress, AptitudeTestAttempt } = require('../models/Aptitude');
const { protect } = require('../middleware/authMiddleware');
const { dateInIndia, shiftDate } = require('../utils/progress');
const { summaryFor } = require('./aptitudeRoutes');

const router = express.Router();
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const WEAK_MIN = 3; // answers needed before a topic is judged
const DAYS = 30;

router.get('/analytics', protect, async (req, res) => {
  const uid = new mongoose.Types.ObjectId(String(req.user._id));
  const since = shiftDate(dateInIndia(), -(DAYS - 1));

  const [practiceTopics, practiceDiff, practiceDays, testItems, tests, summary] = await Promise.all([
    AptitudeAttempt.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$topic', answered: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } }, seconds: { $sum: '$seconds' } } },
    ]),
    AptitudeAttempt.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$difficulty', answered: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } } } },
    ]),
    AptitudeAttempt.aggregate([
      { $match: { user: uid, day: { $gte: since } } },
      { $group: { _id: '$day', answered: { $sum: 1 }, correct: { $sum: { $cond: ['$correct', 1, 0] } } } },
    ]),
    // Answered test questions count toward topic accuracy too.
    AptitudeTestAttempt.aggregate([
      { $match: { user: uid, status: { $ne: 'in-progress' } } },
      { $unwind: '$items' },
      { $match: { 'items.selected': { $ne: null } } },
      { $lookup: { from: 'aptitudequestions', localField: 'items.question', foreignField: '_id', as: 'q', pipeline: [{ $project: { topic: 1, difficulty: 1 } }] } },
      { $unwind: '$q' },
      { $group: { _id: { topic: '$q.topic', difficulty: '$q.difficulty' }, answered: { $sum: 1 }, correct: { $sum: { $cond: ['$items.correct', 1, 0] } }, seconds: { $sum: '$items.seconds' } } },
    ]),
    AptitudeTestAttempt.find({ user: uid, status: { $ne: 'in-progress' } }).sort({ submittedAt: -1 }).limit(10)
      .select('test score maxScore submittedAt').populate('test', 'title').lean(),
    summaryFor(uid),
  ]);

  // Merge practice and test answers per topic and per difficulty.
  const topicMap = new Map();
  const add = (map, key, row) => {
    const t = map.get(key) || { answered: 0, correct: 0, seconds: 0 };
    t.answered += row.answered;
    t.correct += row.correct;
    t.seconds += row.seconds || 0;
    map.set(key, t);
  };
  practiceTopics.forEach((r) => add(topicMap, r._id, r));
  const diffMap = new Map();
  practiceDiff.forEach((r) => add(diffMap, r._id, r));
  testItems.forEach((r) => {
    add(topicMap, r._id.topic, r);
    add(diffMap, r._id.difficulty, r);
  });

  const topics = [...topicMap.entries()].filter(([slug]) => topicIndex.has(slug)).map(([slug, t]) => {
    const info = topicIndex.get(slug);
    return { slug, name: info.name, category: info.category, answered: t.answered, correct: t.correct, accuracy: pct(t.correct, t.answered), avgSeconds: t.answered ? Math.round(t.seconds / t.answered) : 0 };
  });
  const judged = topics.filter((t) => t.answered >= WEAK_MIN);

  const categories = CATEGORIES.map((c) => {
    const mine = topics.filter((t) => t.category === c.slug);
    const answered = mine.reduce((s, t) => s + t.answered, 0);
    const correct = mine.reduce((s, t) => s + t.correct, 0);
    return { slug: c.slug, name: c.name, short: c.short, color: c.color, answered, correct, accuracy: pct(correct, answered), topicsTried: mine.length, topicsTotal: c.topics.length };
  });

  const testDays = new Map();
  tests.forEach((t) => {
    const d = dateInIndia(t.submittedAt);
    if (d >= since) testDays.set(d, (testDays.get(d) || 0) + 1);
  });
  const dayMap = new Map(practiceDays.map((d) => [d._id, d]));
  const activity = Array.from({ length: DAYS }, (_, i) => {
    const day = shiftDate(since, i);
    const d = dayMap.get(day);
    return { day, answered: d?.answered || 0, correct: d?.correct || 0, tests: testDays.get(day) || 0 };
  });

  res.json({
    summary,
    categories,
    topics: topics.sort((a, b) => b.answered - a.answered),
    weak: [...judged].filter((t) => t.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5),
    strong: [...judged].filter((t) => t.accuracy >= 80).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5),
    difficulty: DIFFICULTIES.map((d) => {
      const t = diffMap.get(d) || { answered: 0, correct: 0 };
      return { difficulty: d, answered: t.answered, correct: t.correct, accuracy: pct(t.correct, t.answered) };
    }),
    activity,
    tests: tests.reverse().map((t) => ({ id: String(t._id), title: t.test?.title || 'Removed test', score: t.score, maxScore: t.maxScore, percent: pct(Math.max(0, t.score), t.maxScore), at: t.submittedAt })),
  });
});

// ---------- Mistake notebook ----------
// Every question here was already answered, so solutions are fine to show.
router.get('/mistakes', protect, async (req, res) => {
  const show = ['open', 'understood', 'all'].includes(req.query.show) ? req.query.show : 'open';
  const progress = await AptitudeProgress.findOne({ user: req.user._id }).select('mistakes').lean();
  const all = progress?.mistakes || [];
  const list = all.filter((m) => (show === 'all' ? true : show === 'understood' ? m.understood : !m.understood));
  const qs = await AptitudeQuestion.find({ _id: { $in: list.map((m) => m.question) } })
    .select('code statement options answer explanation shortcut category topic difficulty').lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const topic = req.query.topic && topicIndex.has(req.query.topic) ? req.query.topic : '';
  const items = list
    .map((m) => ({ m, q: byId.get(String(m.question)) }))
    .filter(({ q }) => q && (!topic || q.topic === topic))
    .sort((a, b) => new Date(b.m.at) - new Date(a.m.at))
    .map(({ m, q }) => ({
      id: String(q._id),
      code: q.code,
      statement: q.statement,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      shortcut: q.shortcut,
      category: q.category,
      topic: q.topic,
      topicName: topicIndex.get(q.topic)?.name || q.topic,
      difficulty: q.difficulty,
      at: m.at,
      understood: m.understood,
    }));
  res.json({
    open: all.filter((m) => !m.understood).length,
    understood: all.filter((m) => m.understood).length,
    items,
  });
});

router.post('/mistakes/:id', protect, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not in your notebook.' });
  const understood = req.body?.understood !== false;
  const r = await AptitudeProgress.updateOne(
    { user: req.user._id, 'mistakes.question': req.params.id },
    { $set: { 'mistakes.$.understood': understood } },
  );
  if (!r.matchedCount) return res.status(404).json({ message: 'Not in your notebook.' });
  res.json({ ok: true, understood });
});

router.delete('/mistakes/:id', protect, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not in your notebook.' });
  await AptitudeProgress.updateOne({ user: req.user._id }, { $pull: { mistakes: { question: req.params.id } } });
  res.json({ ok: true });
});

module.exports = router;
