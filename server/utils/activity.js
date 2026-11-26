// Per-student totals from Reverse Coding and the Forum, used by badges and
// the leaderboard. Pass userIds to limit to some students (or omit for all).

const mongoose = require('mongoose');
const { ReverseAttempt } = require('../models/Reverse');
const { ForumThread, ForumReply } = require('../models/Forum');

const toIds = (userIds) => (userIds ? userIds.map((id) => new mongoose.Types.ObjectId(String(id))) : null);

/** Map userId → { xp, solved }: best score per challenge, summed. */
async function reverseSummary(userIds) {
  const ids = toIds(userIds);
  const rows = await ReverseAttempt.aggregate([
    { $match: { kind: 'submit', ...(ids ? { user: { $in: ids } } : {}) } },
    {
      $group: {
        _id: { user: '$user', challenge: '$challenge' },
        best: { $max: '$score' },
        solved: { $max: { $cond: [{ $eq: ['$verdict', 'accepted'] }, 1, 0] } },
      },
    },
    { $group: { _id: '$_id.user', xp: { $sum: '$best' }, solved: { $sum: '$solved' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { xp: r.xp, solved: r.solved }]));
}

/**
 * Map userId → { posts, acceptedAnswers }. An accepted answer counts only
 * when someone else accepted it on their own question (no self-accepts).
 */
async function forumSummary(userIds) {
  const ids = toIds(userIds);
  const byAuthor = ids ? { author: { $in: ids } } : {};
  const [threads, replies, accepted] = await Promise.all([
    ForumThread.aggregate([{ $match: { status: 'visible', ...byAuthor } }, { $group: { _id: '$author', n: { $sum: 1 } } }]),
    ForumReply.aggregate([{ $match: { status: 'visible', ...byAuthor } }, { $group: { _id: '$author', n: { $sum: 1 } } }]),
    ForumThread.aggregate([
      { $match: { status: 'visible', acceptedReply: { $ne: null } } },
      { $lookup: { from: ForumReply.collection.name, localField: 'acceptedReply', foreignField: '_id', as: 'reply' } },
      { $unwind: '$reply' },
      { $match: { 'reply.status': 'visible', $expr: { $ne: ['$reply.author', '$author'] }, ...(ids ? { 'reply.author': { $in: ids } } : {}) } },
      { $group: { _id: '$reply.author', n: { $sum: 1 } } },
    ]),
  ]);

  const map = new Map();
  const add = (rows, key) => rows.forEach((r) => {
    const id = String(r._id);
    map.set(id, { posts: 0, acceptedAnswers: 0, ...map.get(id), [key]: (map.get(id)?.[key] || 0) + r.n });
  });
  add(threads, 'posts');
  add(replies, 'posts');
  add(accepted, 'acceptedAnswers');
  return map;
}

module.exports = { reverseSummary, forumSummary };

/**
 * Map userId → { xp, solved, bestStreak, tests, dailies } from Aptitude.
 * XP = practice XP + bonuses (goals, streaks, mock tests, daily challenges).
 */
async function aptitudeSummary(userIds) {
  const { AptitudeAttempt, AptitudeProgress, AptitudeTestAttempt, AptitudeDailyAttempt } = require('../models/Aptitude');
  const ids = toIds(userIds);
  const match = ids ? { user: { $in: ids } } : {};
  const [attempts, progress, tests, dailies] = await Promise.all([
    AptitudeAttempt.aggregate([
      { $match: match },
      { $group: { _id: { user: '$user', q: '$question' }, xp: { $sum: '$xp' }, solved: { $max: { $cond: ['$correct', 1, 0] } } } },
      { $group: { _id: '$_id.user', xp: { $sum: '$xp' }, solved: { $sum: '$solved' } } },
    ]),
    AptitudeProgress.find(match).select('user bonusXp bestStreak').lean(),
    AptitudeTestAttempt.aggregate([{ $match: { ...match, status: { $ne: 'in-progress' } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
    AptitudeDailyAttempt.aggregate([{ $match: { ...match, submittedAt: { $ne: null } } }, { $group: { _id: '$user', n: { $sum: 1 }, perfect: { $sum: { $cond: [{ $eq: ['$correctCount', { $size: '$answers' }] }, 1, 0] } } } }]),
  ]);
  const out = new Map();
  const get = (id) => {
    const key = String(id);
    if (!out.has(key)) out.set(key, { xp: 0, solved: 0, bestStreak: 0, tests: 0, dailies: 0, perfectDailies: 0 });
    return out.get(key);
  };
  attempts.forEach((r) => Object.assign(get(r._id), { xp: get(r._id).xp + r.xp, solved: r.solved }));
  progress.forEach((p) => { const s = get(p.user); s.xp += p.bonusXp || 0; s.bestStreak = p.bestStreak || 0; });
  tests.forEach((r) => { get(r._id).tests = r.n; });
  dailies.forEach((r) => { Object.assign(get(r._id), { dailies: r.n, perfectDailies: r.perfect }); });
  return out;
}

module.exports.aptitudeSummary = aptitudeSummary;
