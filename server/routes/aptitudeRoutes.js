// Aptitude preparation: catalogue, practice, tests, progress, daily challenge.
// Answers, explanations and scores are worked out here on the server only.
const express = require('express');
const mongoose = require('mongoose');
const { CATEGORIES, PLACEMENT_TRACKS, DIFFICULTIES, topicIndex } = require('../data/aptitudeTopics');
const { AptitudeQuestion, AptitudeAttempt, AptitudeProgress } = require('../models/Aptitude');
const { protect } = require('../middleware/authMiddleware');
const { dateInIndia, shiftDate } = require('../utils/progress');
const resources = require('../data/aptitudeResources');
const { syncBadges } = require('../utils/badges');

// Badges newly earned by a student; never fails the request that triggered it.
async function newBadgesFor(userId) {
  try {
    const { newBadges } = await syncBadges(userId);
    return (newBadges || []).map((b) => ({ id: b.id, name: b.name, emoji: b.emoji }));
  } catch {
    return [];
  }
}

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
      return { ...c, topics, questions: topics.reduce((sum, t) => sum + t.questions, 0), resources: resources.categoryLinks(c.slug) };
    }),
    tracks: PLACEMENT_TRACKS.map((t) => ({ ...t, resources: resources.trackLinks(t.slug) })),
    resources: resources.generalLinks(),
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
    resources: resources.topicLinks(topic.slug),
  });
});

// GET /api/aptitude/me: the signed-in student's aptitude summary.
router.get('/me', protect, async (req, res) => {
  res.json({ summary: await summaryFor(req.user._id) });
});

// =====================================================================
// Practice
// =====================================================================

// XP for the first correct answer to a question (configurable).
const XP_BY_DIFFICULTY = { 'very-easy': 2, easy: 4, medium: 6, hard: 10 };
// Daily goals, each paid once per day.
const DAILY_GOALS = [
  { key: 'answered5', count: 5, xp: 10, label: 'Answer 5 questions today' },
  { key: 'answered10', count: 10, xp: 20, label: 'Answer 10 questions today' },
];
const STREAK_BONUS = { every: 7, xp: 25 };
const PAGE_SIZE = 20;
const DIFF_ORDER = Object.fromEntries(DIFFICULTIES.map((d, i) => [d, i]));
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// What a student may see before answering: never the answer or explanation.
function publicQuestion(q, state = {}) {
  const topic = topicIndex.get(q.topic);
  return {
    id: String(q._id),
    code: q.code,
    title: q.title,
    statement: q.statement,
    options: q.options,
    category: q.category,
    topic: q.topic,
    topicName: topic?.name || q.topic,
    difficulty: q.difficulty,
    estimatedSeconds: q.estimatedSeconds,
    marks: q.marks,
    hasHint: Boolean(q.hint),
    bookmarked: Boolean(state.bookmarked),
    state: state.state || 'new', // new | correct | wrong
  };
}

const solutionOf = (q) => ({
  answer: q.answer,
  explanation: q.explanation,
  shortcut: q.shortcut,
});

async function myPracticeState(userId) {
  const [solved, attempted, progress] = await Promise.all([
    AptitudeAttempt.distinct('question', { user: userId, correct: true }),
    AptitudeAttempt.distinct('question', { user: userId }),
    AptitudeProgress.findOne({ user: userId }).select('bookmarks').lean(),
  ]);
  return {
    solved: new Set(solved.map(String)),
    attempted: new Set(attempted.map(String)),
    bookmarks: new Set((progress?.bookmarks || []).map((b) => String(b.question))),
  };
}

const stateFor = (mine, id) => ({
  bookmarked: mine.bookmarks.has(id),
  state: mine.solved.has(id) ? 'correct' : mine.attempted.has(id) ? 'wrong' : 'new',
});

async function findPublished(id) {
  if (!isId(id)) return null;
  return AptitudeQuestion.findOne({ _id: id, status: 'published' }).lean();
}

// GET /api/aptitude/practice?category=&topic=&difficulty=&status=&page=
// status: new | attempted | correct | wrong | bookmarked
router.get('/practice', protect, async (req, res) => {
  const filter = { status: 'published' };
  if (CATEGORIES.some((c) => c.slug === req.query.category)) filter.category = req.query.category;
  if (topicIndex.has(req.query.topic)) filter.topic = req.query.topic;
  if (DIFFICULTIES.includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;

  const mine = await myPracticeState(req.user._id);
  const ids = (set) => [...set].map((x) => new mongoose.Types.ObjectId(x));
  const status = String(req.query.status || '');
  if (status === 'new') filter._id = { $nin: ids(mine.attempted) };
  if (status === 'attempted') filter._id = { $in: ids(mine.attempted) };
  if (status === 'correct') filter._id = { $in: ids(mine.solved) };
  if (status === 'wrong') filter._id = { $in: ids(mine.attempted).filter((x) => !mine.solved.has(String(x))) };
  if (status === 'bookmarked') filter._id = { $in: ids(mine.bookmarks) };

  const all = await AptitudeQuestion.find(filter)
    .select('code title statement options category topic difficulty estimatedSeconds marks hint')
    .lean();
  // Topic order, then easiest first, then code.
  const topicOrder = (q) => {
    const t = topicIndex.get(q.topic);
    return (CATEGORIES.findIndex((c) => c.slug === q.category) * 100) + (t?.order ?? 99);
  };
  all.sort((a, b) => topicOrder(a) - topicOrder(b) || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || a.code.localeCompare(b.code));

  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  res.json({
    total: all.length,
    page,
    pages,
    questions: slice.map((q) => publicQuestion(q, stateFor(mine, String(q._id)))),
  });
});

// GET /api/aptitude/questions/:id/hint
router.get('/questions/:id/hint', protect, async (req, res) => {
  const q = await findPublished(req.params.id);
  if (!q) return res.status(404).json({ message: 'Question not found.' });
  res.json({ hint: q.hint || 'No hint for this one. Try working it out step by step.' });
});

// POST /api/aptitude/questions/:id/reveal: show the solution without answering.
// Revealing before a correct answer means that question earns no XP later.
router.post('/questions/:id/reveal', protect, async (req, res) => {
  const q = await findPublished(req.params.id);
  if (!q) return res.status(404).json({ message: 'Question not found.' });
  const solved = await AptitudeAttempt.exists({ user: req.user._id, question: q._id, correct: true });
  if (!solved) {
    await AptitudeProgress.updateOne({ user: req.user._id }, { $addToSet: { revealed: q._id } }, { upsert: true });
  }
  res.json({ ...solutionOf(q), xpForfeited: !solved });
});

// POST /api/aptitude/questions/:id/bookmark: toggle.
router.post('/questions/:id/bookmark', protect, async (req, res) => {
  const q = await findPublished(req.params.id);
  if (!q) return res.status(404).json({ message: 'Question not found.' });
  const removed = await AptitudeProgress.findOneAndUpdate(
    { user: req.user._id, 'bookmarks.question': q._id },
    { $pull: { bookmarks: { question: q._id } } },
    { returnDocument: 'after' },
  );
  if (removed) return res.json({ bookmarked: false });
  await AptitudeProgress.updateOne({ user: req.user._id }, { $push: { bookmarks: { question: q._id, at: new Date() } } }, { upsert: true });
  return res.json({ bookmarked: true });
});

// Update the practice streak and pay any daily goals / streak bonus once.
async function afterAnswer(userId, today) {
  const yesterday = shiftDate(today, -1);
  const progress = await AptitudeProgress.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, returnDocument: 'after' },
  );
  if (progress.lastActiveDay !== today) {
    progress.streak = progress.lastActiveDay === yesterday ? progress.streak + 1 : 1;
    progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
    progress.lastActiveDay = today;
    await AptitudeProgress.updateOne(
      { _id: progress._id, lastActiveDay: { $ne: today } },
      { $set: { streak: progress.streak, bestStreak: progress.bestStreak, lastActiveDay: today } },
    );
  }

  const rewards = [];
  const claim = async (key, xp, label) => {
    // Atomic: only the first request to add this key gets the XP.
    const updated = await AptitudeProgress.findOneAndUpdate(
      { user: userId, goalsClaimed: { $ne: key } },
      { $addToSet: { goalsClaimed: key }, $inc: { bonusXp: xp } },
    );
    if (updated) rewards.push({ label, xp });
  };
  const answeredToday = await AptitudeAttempt.countDocuments({ user: userId, day: today, mode: 'practice' });
  for (const goal of DAILY_GOALS) {
    if (answeredToday >= goal.count) await claim(`${today}:${goal.key}`, goal.xp, goal.label);
  }
  if (progress.streak > 0 && progress.streak % STREAK_BONUS.every === 0) {
    await claim(`${today}:streak${progress.streak}`, STREAK_BONUS.xp, `${progress.streak}-day streak`);
  }
  return { rewards, streak: progress.streak, answeredToday };
}

// POST /api/aptitude/questions/:id/answer { selected, seconds }
router.post('/questions/:id/answer', protect, async (req, res) => {
  const q = await findPublished(req.params.id);
  if (!q) return res.status(404).json({ message: 'Question not found.' });
  const selected = Number(req.body?.selected);
  if (!Number.isInteger(selected) || selected < 0 || selected >= q.options.length) {
    return res.status(400).json({ message: 'Choose one of the options.' });
  }
  const seconds = Math.min(7200, Math.max(0, Math.round(Number(req.body?.seconds) || 0)));
  const correct = selected === q.answer;
  const today = dateInIndia();
  const userId = req.user._id;

  // XP only for the first correct answer, and not after peeking at the solution.
  let xp = 0;
  if (correct) {
    const [alreadySolved, progress] = await Promise.all([
      AptitudeAttempt.exists({ user: userId, question: q._id, correct: true }),
      AptitudeProgress.findOne({ user: userId, revealed: q._id }).select('_id').lean(),
    ]);
    if (!alreadySolved && !progress) xp = XP_BY_DIFFICULTY[q.difficulty] || 0;
  }
  const record = { user: userId, question: q._id, category: q.category, topic: q.topic, difficulty: q.difficulty, selected, correct, seconds, mode: 'practice', day: today };
  try {
    await AptitudeAttempt.create({ ...record, xp });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // A parallel request already took this question's XP.
    xp = 0;
    await AptitudeAttempt.create({ ...record, xp: 0 });
  }

  // Wrong answers go to the mistake notebook (once); a later correct answer
  // leaves the entry for the student to mark as understood.
  if (!correct) {
    await AptitudeProgress.updateOne(
      { user: userId, 'mistakes.question': { $ne: q._id } },
      { $push: { mistakes: { question: q._id, at: new Date() } } },
      { upsert: false },
    ).then(async (r) => {
      if (!r.matchedCount) {
        // No progress document yet, or already in the notebook.
        const exists = await AptitudeProgress.exists({ user: userId });
        if (!exists) await AptitudeProgress.create({ user: userId, mistakes: [{ question: q._id }] }).catch(() => {});
      }
    });
  }

  const after = await afterAnswer(userId, today);
  res.json({
    correct,
    ...solutionOf(q),
    selected,
    seconds,
    xp,
    rewards: after.rewards,
    streak: after.streak,
    answeredToday: after.answeredToday,
    goals: DAILY_GOALS.map((g) => ({ ...g, done: after.answeredToday >= g.count })),
    badges: correct ? await newBadgesFor(userId) : [],
  });
});

module.exports = router;
module.exports.summaryFor = summaryFor;
module.exports.liveStreak = liveStreak;
module.exports.afterAnswer = afterAnswer;
module.exports.newBadgesFor = newBadgesFor;
