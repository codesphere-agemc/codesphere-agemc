// Aptitude preparation: catalogue, practice, tests, progress, daily challenge.
// Answers, explanations and scores are worked out here on the server only.
const express = require('express');
const mongoose = require('mongoose');
const { CATEGORIES, PLACEMENT_TRACKS, DIFFICULTIES, topicIndex } = require('../data/aptitudeTopics');
const { AptitudeQuestion, AptitudeAttempt, AptitudeProgress } = require('../models/Aptitude');
const { protect } = require('../middleware/authMiddleware');
const { dateInIndia, shiftDate } = require('../utils/progress');

const router = express.Router();

const LEVELS = [
  { name: 'Beginner', min: 0 },
  { name: 'Learner', min: 25 },
  { name: 'Practitioner', min: 100 },
  { name: 'Problem Solver', min: 250 },
  { name: 'Aptitude Pro', min: 500 },
];
const levelFor = (correct) => {
  const index = LEVELS.reduce((found, level, i) => (correct >= level.min ? i : found), 0);
  return { name: LEVELS[index].name, next: LEVELS[index + 1] || null, index };
};

// A streak counts only while the last practice day is today or yesterday.
const liveStreak = (progress, today = dateInIndia()) => (
  progress && [today, shiftDate(today, -1)].includes(progress.lastActiveDay) ? progress.streak : 0
);

// Totals for one student (or null for a guest).
async function summaryFor(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [totals] = await AptitudeAttempt.aggregate([
    { $match: { user: uid } },
    {
      $group: {
        _id: null,
        attempts: { $sum: 1 },
        correctAnswers: { $sum: { $cond: ['$correct', 1, 0] } },
        seconds: { $sum: '$seconds' },
        xp: { $sum: '$xp' },
        questions: { $addToSet: '$question' },
      },
    },
  ]);
  const solved = await AptitudeAttempt.distinct('question', { user: uid, correct: true });
  const progress = await AptitudeProgress.findOne({ user: uid }).lean();
  const attempts = totals?.attempts || 0;
  const correctAnswers = totals?.correctAnswers || 0;
  return {
    questionsAttempted: totals?.questions.length || 0,
    questionsSolved: solved.length,
    answers: attempts,
    accuracy: attempts ? Math.round((correctAnswers / attempts) * 100) : 0,
    practiceSeconds: totals?.seconds || 0,
    xp: (totals?.xp || 0) + (progress?.bonusXp || 0),
    streak: liveStreak(progress),
    bestStreak: progress?.bestStreak || 0,
    bookmarks: progress?.bookmarks?.length || 0,
    mistakes: (progress?.mistakes || []).filter((m) => !m.understood).length,
    level: levelFor(solved.length),
  };
}

// GET /api/aptitude/catalog: categories, topics and how many published
// questions each has (public).
router.get('/catalog', async (req, res) => {
  const counts = await AptitudeQuestion.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: { topic: '$topic', difficulty: '$difficulty' }, n: { $sum: 1 } } },
  ]);
  const byTopic = new Map();
  counts.forEach(({ _id, n }) => {
    const row = byTopic.get(_id.topic) || { total: 0 };
    row.total += n;
    row[_id.difficulty] = n;
    byTopic.set(_id.topic, row);
  });
  res.json({
    categories: CATEGORIES.map((c) => {
      const topics = c.topics.map((t) => ({ ...t, questions: byTopic.get(t.slug)?.total || 0, byDifficulty: byTopic.get(t.slug) || {} }));
      return { ...c, topics, questions: topics.reduce((sum, t) => sum + t.questions, 0) };
    }),
    tracks: PLACEMENT_TRACKS,
    difficulties: DIFFICULTIES,
  });
});

// GET /api/aptitude/topics/:slug: one topic with its question counts (public).
router.get('/topics/:slug', async (req, res) => {
  const topic = topicIndex.get(String(req.params.slug));
  if (!topic) return res.status(404).json({ message: 'Topic not found.' });
  const rows = await AptitudeQuestion.aggregate([
    { $match: { status: 'published', topic: topic.slug } },
    { $group: { _id: '$difficulty', n: { $sum: 1 }, avgSeconds: { $avg: '$estimatedSeconds' } } },
  ]);
  const byDifficulty = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  const category = CATEGORIES.find((c) => c.slug === topic.category);
  res.json({
    topic: {
      ...topic,
      color: category.color,
      icon: category.icon,
      questions: rows.reduce((sum, r) => sum + r.n, 0),
      byDifficulty,
      avgSeconds: rows.length ? Math.round(rows.reduce((s, r) => s + r.avgSeconds * r.n, 0) / rows.reduce((s, r) => s + r.n, 0)) : 0,
    },
    siblings: category.topics.map((t) => ({ slug: t.slug, name: t.name })),
  });
});

// GET /api/aptitude/me: the signed-in student's aptitude summary.
router.get('/me', protect, async (req, res) => {
  res.json({ summary: await summaryFor(req.user._id) });
});

module.exports = router;
module.exports.summaryFor = summaryFor;
module.exports.liveStreak = liveStreak;
