// Aptitude daily challenge and the aptitude leaderboard.
const express = require('express');
const mongoose = require('mongoose');
const { topicIndex } = require('../data/aptitudeTopics');
const {
  AptitudeQuestion, AptitudeAttempt, AptitudeProgress, AptitudeTestAttempt, AptitudeDaily, AptitudeDailyAttempt,
} = require('../models/Aptitude');
const User = require('../models/User');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { dateInIndia, shiftDate } = require('../utils/progress');
const { aptitudeSummary } = require('../utils/activity');
const { afterAnswer, liveStreak, newBadgesFor } = require('./aptitudeRoutes');

const router = express.Router();

const DAILY = {
  seconds: 300,
  xpPerCorrect: 4,
  perfectBonus: 10,
  // Today's mix: 5 questions across the four areas.
  mix: [['quantitative', 2], ['logical', 1], ['verbal', 1], ['data-interpretation', 1]],
};
const GRACE_MS = 10000;

// Today's set, created by the first visitor of the day. Questions the student
// body saw in the last week are avoided while there are enough others.
async function ensureDaily(day) {
  const existing = await AptitudeDaily.findOne({ day }).lean();
  if (existing) return existing;
  const recent = await AptitudeDaily.find({ day: { $gte: shiftDate(day, -7) } }).select('questions').lean();
  const avoid = recent.flatMap((d) => d.questions);
  const picked = [];
  for (const [category, count] of DAILY.mix) {
    const need = count;
    let rows = await AptitudeQuestion.aggregate([
      { $match: { status: 'published', category, _id: { $nin: [...avoid, ...picked] } } },
      { $sample: { size: need } },
      { $project: { _id: 1 } },
    ]);
    if (rows.length < need) {
      rows = rows.concat(await AptitudeQuestion.aggregate([
        { $match: { status: 'published', category, _id: { $nin: [...picked, ...rows.map((r) => r._id)] } } },
        { $sample: { size: need - rows.length } },
        { $project: { _id: 1 } },
      ]));
    }
    picked.push(...rows.map((r) => r._id));
  }
  if (picked.length < 5) {
    // Thin bank: top up from anything published.
    const more = await AptitudeQuestion.aggregate([
      { $match: { status: 'published', _id: { $nin: picked } } },
      { $sample: { size: 5 - picked.length } },
      { $project: { _id: 1 } },
    ]);
    picked.push(...more.map((r) => r._id));
  }
  if (!picked.length) return null;
  const xp = picked.length * DAILY.xpPerCorrect + DAILY.perfectBonus;
  try {
    return (await AptitudeDaily.create({ day, questions: picked, seconds: DAILY.seconds, xp })).toObject();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return AptitudeDaily.findOne({ day }).lean(); // someone else created it first
  }
}

async function questionsOf(daily, withAnswers) {
  const qs = await AptitudeQuestion.find({ _id: { $in: daily.questions } }).lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  return daily.questions.map((id) => byId.get(String(id))).filter(Boolean).map((q) => ({
    id: String(q._id),
    statement: q.statement,
    options: q.options,
    category: q.category,
    topicName: topicIndex.get(q.topic)?.name || q.topic,
    difficulty: q.difficulty,
    ...(withAnswers ? { answer: q.answer, explanation: q.explanation, shortcut: q.shortcut } : {}),
  }));
}

const resultOf = (attempt) => ({
  answers: attempt.answers.map((a) => ({ selected: a.selected, correct: a.correct })),
  correctCount: attempt.correctCount,
  total: attempt.answers.length,
  seconds: attempt.seconds,
  xp: attempt.xp,
  late: Boolean(attempt.late),
});

// GET /api/aptitude/daily: today's challenge and where this student stands.
router.get('/daily', optionalAuth, async (req, res) => {
  const day = dateInIndia();
  const daily = await ensureDaily(day);
  if (!daily) return res.json({ day, available: false });
  const base = { day, available: true, count: daily.questions.length, seconds: daily.seconds, xpMax: daily.xp };
  if (!req.user) return res.json(base);

  const [attempt, history, progress] = await Promise.all([
    AptitudeDailyAttempt.findOne({ day, user: req.user._id }).lean(),
    AptitudeDailyAttempt.find({ user: req.user._id, day: { $gte: shiftDate(day, -6) }, submittedAt: { $ne: null } }).select('day correctCount answers').lean(),
    AptitudeProgress.findOne({ user: req.user._id }).select('streak lastActiveDay bestStreak').lean(),
  ]);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDate(day, i - 6);
    const h = history.find((x) => x.day === d);
    return { day: d, done: Boolean(h), correct: h?.correctCount || 0, total: h?.answers.length || 0 };
  });
  const out = { ...base, week, streak: liveStreak(progress, day), bestStreak: progress?.bestStreak || 0, state: 'new' };
  if (attempt?.submittedAt) {
    Object.assign(out, { state: 'done', result: resultOf(attempt), questions: await questionsOf(daily, true) });
  } else if (attempt) {
    Object.assign(out, { state: 'started', deadline: new Date(attempt.startedAt.getTime() + daily.seconds * 1000), serverNow: new Date(), questions: await questionsOf(daily, false) });
  }
  res.json(out);
});

// POST /api/aptitude/daily/start: the clock starts now (once per day).
router.post('/daily/start', protect, async (req, res) => {
  const day = dateInIndia();
  const daily = await ensureDaily(day);
  if (!daily) return res.status(409).json({ message: 'No questions are available yet.' });
  let attempt = await AptitudeDailyAttempt.findOne({ day, user: req.user._id }).lean();
  if (!attempt) {
    try {
      attempt = (await AptitudeDailyAttempt.create({ day, user: req.user._id, startedAt: new Date() })).toObject();
    } catch (error) {
      if (error.code !== 11000) throw error;
      attempt = await AptitudeDailyAttempt.findOne({ day, user: req.user._id }).lean();
    }
  }
  if (attempt.submittedAt) return res.status(409).json({ message: "You've already done today's challenge." });
  res.json({
    deadline: new Date(attempt.startedAt.getTime() + daily.seconds * 1000),
    serverNow: new Date(),
    questions: await questionsOf(daily, false),
  });
});

// POST /api/aptitude/daily/submit { answers: [index|null, ...] }
router.post('/daily/submit', protect, async (req, res) => {
  const day = dateInIndia();
  const userId = req.user._id;
  const daily = await AptitudeDaily.findOne({ day }).lean();
  const attempt = daily && await AptitudeDailyAttempt.findOne({ day, user: userId }).lean();
  if (!attempt) return res.status(409).json({ message: "Start today's challenge first." });
  if (attempt.submittedAt) return res.status(409).json({ message: "You've already done today's challenge." });

  const qs = await AptitudeQuestion.find({ _id: { $in: daily.questions } }).lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const list = daily.questions.map((id) => byId.get(String(id))).filter(Boolean);
  const now = new Date();
  const late = now.getTime() > attempt.startedAt.getTime() + daily.seconds * 1000 + GRACE_MS;
  const sent = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answers = list.map((q, i) => {
    const v = late ? null : sent[i];
    const selected = Number.isInteger(v) && v >= 0 && v < q.options.length ? v : null;
    return { question: q._id, selected, correct: selected != null && selected === q.answer };
  });
  const correctCount = answers.filter((a) => a.correct).length;
  const xp = late ? 0 : correctCount * DAILY.xpPerCorrect + (correctCount === list.length && list.length ? DAILY.perfectBonus : 0);
  const seconds = Math.min(daily.seconds, Math.round((now - attempt.startedAt) / 1000));

  // Atomic: only the first submit counts.
  const done = await AptitudeDailyAttempt.findOneAndUpdate(
    { _id: attempt._id, submittedAt: null },
    { $set: { submittedAt: now, answers, correctCount, seconds, xp, late } },
    { returnDocument: 'after' },
  ).lean();
  if (!done) return res.status(409).json({ message: "You've already done today's challenge." });

  const answered = answers.filter((a) => a.selected != null);
  if (answered.length) {
    // Recorded for analytics (XP is paid once below, not per question).
    await AptitudeAttempt.insertMany(answered.map((a) => {
      const q = byId.get(String(a.question));
      return { user: userId, question: q._id, category: q.category, topic: q.topic, difficulty: q.difficulty, selected: a.selected, correct: a.correct, seconds: Math.round(seconds / list.length), xp: 0, mode: 'daily', day };
    }));
  }
  const wrong = answered.filter((a) => !a.correct).map((a) => String(a.question));
  const progress = await AptitudeProgress.findOne({ user: userId }).select('mistakes').lean();
  const have = new Set((progress?.mistakes || []).map((m) => String(m.question)));
  const update = {};
  if (xp) update.$inc = { bonusXp: xp };
  const fresh = wrong.filter((id) => !have.has(id)).map((id) => ({ question: id, at: now }));
  if (fresh.length) update.$push = { mistakes: { $each: fresh } };
  if (Object.keys(update).length) await AptitudeProgress.updateOne({ user: userId }, update, { upsert: true });

  const after = answered.length ? await afterAnswer(userId, day) : { rewards: [], streak: 0 };
  res.json({
    result: resultOf(done),
    questions: await questionsOf(daily, true),
    rewards: after.rewards,
    streak: after.streak,
    badges: await newBadgesFor(userId),
  });
});

// GET /api/aptitude/leaderboard?period=week|all
router.get('/leaderboard', optionalAuth, async (req, res) => {
  const period = req.query.period === 'all' ? 'all' : 'week';
  const users = await User.find({ role: 'user' }).select('name yearOfStudy profileImage').lean();
  const scores = new Map();
  if (period === 'all') {
    (await aptitudeSummary()).forEach((v, k) => scores.set(k, { xp: v.xp, solved: v.solved }));
  } else {
    const since = new Date(Date.now() - 7 * 86400000);
    const [practice, tests, dailies] = await Promise.all([
      AptitudeAttempt.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$user', xp: { $sum: '$xp' }, solved: { $sum: { $cond: ['$correct', 1, 0] } } } },
      ]),
      AptitudeTestAttempt.aggregate([{ $match: { submittedAt: { $gte: since } } }, { $group: { _id: '$user', xp: { $sum: '$xp' }, solved: { $sum: '$correctCount' } } }]),
      AptitudeDailyAttempt.aggregate([{ $match: { submittedAt: { $gte: since } } }, { $group: { _id: '$user', xp: { $sum: '$xp' } } }]),
    ]);
    const add = (r) => {
      const k = String(r._id);
      const s = scores.get(k) || { xp: 0, solved: 0 };
      s.xp += r.xp || 0;
      s.solved += r.solved || 0;
      scores.set(k, s);
    };
    // Daily answers are already in the practice rows, so only their XP is added.
    practice.forEach(add);
    tests.forEach(add);
    dailies.forEach((r) => add({ _id: r._id, xp: r.xp }));
  }
  const rows = users
    .map((u) => ({ id: String(u._id), name: u.name, avatar: u.profileImage?.url || '', year: u.yearOfStudy || '', ...(scores.get(String(u._id)) || { xp: 0, solved: 0 }) }))
    .filter((r) => r.xp > 0)
    .sort((a, b) => b.xp - a.xp || b.solved - a.solved || a.name.localeCompare(b.name));
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.xp !== rows[i - 1].xp) rank = i + 1;
    r.rank = rank;
  });
  const me = req.user ? rows.find((r) => r.id === String(req.user._id)) || null : null;
  res.json({ period, total: rows.length, rows: rows.slice(0, 50), me });
});

module.exports = router;
