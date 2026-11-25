const mongoose = require('mongoose');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// A published result board: hackathon standings, interview marks, a coding
// contest, a quiz, ... Each board has its own marking scheme (criteria with
// maximum marks) and one entry per participant, team or candidate.

const criterionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
  },
  { _id: false },
);

const entrySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 }, // participant or team name
    subtitle: { type: String, trim: true, maxlength: 120, default: '' }, // role applied for, project title, college…
    members: [{ type: String, trim: true, maxlength: 80 }], // team member names
    users: [{ type: ObjectId, ref: 'User' }], // linked CodeSphere accounts (see "My Results")
    identities: [{ type: String, trim: true, maxlength: 200 }], // emails/usernames typed by the organiser
    scores: [{ _id: false, key: String, marks: Number }],
    adjustment: { type: Number, min: -1000, max: 1000, default: 0 }, // bonus (+) or penalty (−)
    status: {
      type: String,
      enum: ['', 'winner', 'runner-up', 'selected', 'qualified', 'shortlisted', 'waitlisted', 'not-qualified', 'not-selected', 'absent', 'disqualified'],
      default: '',
    },
    award: { type: String, trim: true, maxlength: 80, default: '' },
    remarks: { type: String, trim: true, maxlength: 600, default: '' },
    // Computed on save.
    total: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    rank: { type: Number },
  },
  { _id: true },
);

const resultSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: String,
      enum: ['hackathon', 'interview', 'contest', 'quiz', 'assessment', 'event', 'other'],
      default: 'other',
      index: true,
    },
    organization: { type: String, trim: true, maxlength: 100, default: 'CodeSphere' },
    summary: { type: String, trim: true, maxlength: 10000, default: '' },
    // Banner image (ImageKit), shown on the results page, cards and emails.
    banner: {
      url: { type: String, default: '' },
      fileId: { type: String, default: '' },
    },
    notes: { type: String, trim: true, maxlength: 20000, default: '' }, // how it was judged, next steps…
    heldOn: Date,
    // Where the participants came from (optional).
    source: {
      kind: { type: String, enum: ['', 'hackathon', 'recruitment'], default: '' },
      id: { type: ObjectId },
      slug: { type: String, default: '' },
    },
    criteria: { type: [criterionSchema], default: [] },
    passPercent: { type: Number, min: 0, max: 100 }, // optional qualifying %
    // full: everyone sees every mark; totals: everyone sees totals and ranks,
    // only participants see their own breakdown; private: each participant
    // sees only their own row, everyone else sees the scheme and statistics.
    visibility: { type: String, enum: ['full', 'totals', 'private'], default: 'full' },
    entries: { type: [entrySchema], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: Date,
    createdBy: { type: ObjectId },
  },
  { timestamps: true },
);

resultSchema.index({ status: 1, 'entries.users': 1 });

module.exports = mongoose.model('Result', resultSchema);
