const mongoose = require('mongoose');
const { DIFFICULTIES } = require('../data/aptitudeTopics');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// ---------- Question bank ----------
// The answer, explanation and shortcut are never sent to a student before
// they answer (see routes/aptitudeRoutes.js: publicQuestion()).
const questionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 24 }, // e.g. QA-PCT-003
    title: { type: String, trim: true, maxlength: 140, default: '' },
    statement: { type: String, required: true, maxlength: 4000 },
    category: { type: String, required: true, index: true },
    topic: { type: String, required: true, index: true }, // topic slug (data/aptitudeTopics.js)
    difficulty: { type: String, enum: DIFFICULTIES, default: 'easy', index: true },
    type: { type: String, enum: ['mcq'], default: 'mcq' },
    options: { type: [{ type: String, maxlength: 600 }], validate: (v) => v.length >= 2 && v.length <= 6 },
    answer: { type: Number, required: true, min: 0 }, // index into options
    hint: { type: String, maxlength: 600, default: '' },
    explanation: { type: String, required: true, maxlength: 6000 },
    shortcut: { type: String, maxlength: 1500, default: '' },
    marks: { type: Number, min: 0, max: 20, default: 1 },
    negativeMarks: { type: Number, min: 0, max: 20, default: 0 },
    estimatedSeconds: { type: Number, min: 10, max: 1800, default: 60 },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    tracks: [{ type: String, trim: true }], // placement tracks it suits, e.g. 'tcs-nqt'
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published', index: true },
    source: { type: String, trim: true, maxlength: 80, default: 'codesphere' },
    createdBy: { type: ObjectId },
  },
  { timestamps: true },
);
questionSchema.index({ category: 1, topic: 1, difficulty: 1, status: 1 });

// ---------- Practice attempts (one per answer submitted) ----------
const attemptSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    question: { type: ObjectId, ref: 'AptitudeQuestion', required: true },
    category: String,
    topic: String,
    difficulty: String,
    selected: { type: Number, min: 0 },
    correct: { type: Boolean, required: true },
    seconds: { type: Number, min: 0, max: 7200, default: 0 },
    xp: { type: Number, default: 0 },
    mode: { type: String, enum: ['practice', 'daily'], default: 'practice' },
    day: { type: String, index: true }, // YYYY-MM-DD in India time
  },
  { timestamps: true },
);
attemptSchema.index({ user: 1, question: 1 });
// XP for a question can be recorded only once per student (no farming, even
// with double-clicks): at most one attempt with xp > 0 per user + question.
attemptSchema.index({ user: 1, question: 1, mode: 1 }, { unique: true, partialFilterExpression: { xp: { $gt: 0 } }, name: 'one_xp_award_per_question' });
attemptSchema.index({ user: 1, createdAt: -1 });

// ---------- Per-student state ----------
const progressSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    bookmarks: [{ _id: false, question: { type: ObjectId, ref: 'AptitudeQuestion' }, at: { type: Date, default: Date.now } }],
    // Wrong answers, kept until the student marks them understood.
    mistakes: [{
      _id: false,
      question: { type: ObjectId, ref: 'AptitudeQuestion' },
      at: { type: Date, default: Date.now },
      understood: { type: Boolean, default: false },
    }],
    // Solutions opened before answering: those questions earn no XP.
    revealed: [{ type: ObjectId, ref: 'AptitudeQuestion' }],
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: null },
    // Daily goals already rewarded, as "YYYY-MM-DD:goal" keys (no double claims).
    goalsClaimed: [{ type: String }],
    bonusXp: { type: Number, default: 0 }, // goals, streak and test bonuses
  },
  { timestamps: true },
);

// ---------- Mock tests ----------
const sectionSchema = new Schema({
  _id: false,
  name: { type: String, trim: true, maxlength: 80 },
  category: { type: String, default: '' },
  topics: [{ type: String }], // empty = any topic in the category
  count: { type: Number, min: 1, max: 200 },
  difficulty: { type: String, default: '' }, // '' = mixed
});

const testSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, maxlength: 3000, default: '' },
    kind: { type: String, enum: ['topic', 'section', 'mixed', 'full', 'placement', 'custom'], default: 'mixed' },
    track: { type: String, default: '' }, // placement track slug
    // Either fixed questions, or sections drawn at random for each attempt.
    questions: [{ type: ObjectId, ref: 'AptitudeQuestion' }],
    sections: { type: [sectionSchema], default: [] },
    durationMinutes: { type: Number, min: 1, max: 360, required: true },
    marksPerQuestion: { type: Number, min: 0, max: 20, default: 1 },
    negativeMarks: { type: Number, min: 0, max: 20, default: 0 },
    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: false },
    maxAttempts: { type: Number, min: 0, max: 50, default: 1 }, // 0 = unlimited
    opensAt: Date,
    closesAt: Date,
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    createdBy: { type: ObjectId },
  },
  { timestamps: true },
);

// One sitting of a test. Questions (and option order) are frozen at start; the
// deadline comes from the server's start time, never the browser clock.
const testAttemptSchema = new Schema(
  {
    test: { type: ObjectId, ref: 'AptitudeTest', required: true, index: true },
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    number: { type: Number, default: 1 },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true },
    submittedAt: Date,
    status: { type: String, enum: ['in-progress', 'submitted', 'auto-submitted'], default: 'in-progress', index: true },
    items: [{
      _id: false,
      question: { type: ObjectId, ref: 'AptitudeQuestion' },
      order: [Number], // option order shown to this student
      selected: { type: Number, default: null }, // index into the ORIGINAL options
      review: { type: Boolean, default: false },
      visited: { type: Boolean, default: false },
      seconds: { type: Number, default: 0 },
      correct: Boolean,
      marks: Number,
    }],
    marksPerQuestion: Number,
    negativeMarks: Number,
    score: Number,
    maxScore: Number,
    correctCount: Number,
    wrongCount: Number,
    skippedCount: Number,
    xp: { type: Number, default: 0 },
  },
  { timestamps: true },
);
testAttemptSchema.index({ user: 1, test: 1, number: 1 }, { unique: true });

// ---------- Daily challenge ----------
const dailySchema = new Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD, India time
    questions: [{ type: ObjectId, ref: 'AptitudeQuestion' }],
    seconds: { type: Number, default: 300 },
    xp: { type: Number, default: 20 },
  },
  { timestamps: true },
);

// One daily attempt per student per day (enforced by the unique index).
const dailyAttemptSchema = new Schema(
  {
    day: { type: String, required: true },
    user: { type: ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    submittedAt: Date,
    answers: [{ _id: false, question: ObjectId, selected: Number, correct: Boolean }],
    correctCount: { type: Number, default: 0 },
    seconds: Number,
    xp: { type: Number, default: 0 },
    late: { type: Boolean, default: false }, // submitted after time ran out: no XP
  },
  { timestamps: true },
);
dailyAttemptSchema.index({ day: 1, user: 1 }, { unique: true });

module.exports = {
  AptitudeQuestion: mongoose.model('AptitudeQuestion', questionSchema),
  AptitudeAttempt: mongoose.model('AptitudeAttempt', attemptSchema),
  AptitudeProgress: mongoose.model('AptitudeProgress', progressSchema),
  AptitudeTest: mongoose.model('AptitudeTest', testSchema),
  AptitudeTestAttempt: mongoose.model('AptitudeTestAttempt', testAttemptSchema),
  AptitudeDaily: mongoose.model('AptitudeDaily', dailySchema),
  AptitudeDailyAttempt: mongoose.model('AptitudeDailyAttempt', dailyAttemptSchema),
};
