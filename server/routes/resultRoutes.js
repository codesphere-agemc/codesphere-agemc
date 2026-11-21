// Result boards: hackathon standings, interview marks, contests, quizzes…
// Organisers (admins and hackathon organisers) build a marking scheme, enter
// marks per participant and publish. Members see published boards in the
// Community section, and their own results in the dashboard ("My Results").
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Result = require('../models/Result');
const User = require('../models/User');
const { Hackathon, HackathonTeam, HackathonSubmission } = require('../models/Hackathon');
const { Recruitment, RecruitmentApplication } = require('../models/Recruitment');
const { protect, requireStaff } = require('../middleware/authMiddleware');
const { notify } = require('../utils/notify');

const router = express.Router();

const CATEGORIES = ['hackathon', 'interview', 'contest', 'quiz', 'assessment', 'event', 'other'];
const VISIBILITY = ['full', 'totals', 'private'];
const STATUSES = ['', 'winner', 'runner-up', 'selected', 'qualified', 'shortlisted', 'waitlisted', 'not-qualified', 'not-selected', 'absent', 'disqualified'];
const MAX_CRITERIA = 12;
const MAX_ENTRIES = 1000;

const organizer = [protect, requireStaff('hackathon-organizer')];
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const clean = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const round2 = (n) => Math.round(n * 100) / 100;
const num = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const slugify = (text) => `${clean(text, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'result'}-${crypto.randomBytes(3).toString('hex')}`;
const keyFor = (name, i) => `${clean(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'c'}${i}`;

// ---------- Scoring ----------

// Totals, percentages and ranks. Ties share a rank ("1, 2, 2, 4"); absent and
// disqualified entries are not ranked.
function computeStandings(criteria, entries) {
  const maxTotal = criteria.reduce((sum, c) => sum + c.maxMarks, 0);
  const maxBy = new Map(criteria.map((c) => [c.key, c.maxMarks]));
  entries.forEach((e) => {
    const marks = (e.scores || []).reduce((sum, s) => sum + (maxBy.has(s.key) ? Math.min(Number(s.marks) || 0, maxBy.get(s.key)) : 0), 0);
    e.total = round2(Math.max(0, marks + (Number(e.adjustment) || 0)));
    e.percent = maxTotal ? round2(Math.min(100, (e.total / maxTotal) * 100)) : 0;
  });
  const ranked = entries
    .filter((e) => !['absent', 'disqualified'].includes(e.status))
    .sort((a, b) => b.total - a.total);
  ranked.forEach((e, i) => {
    e.rank = i > 0 && ranked[i - 1].total === e.total ? ranked[i - 1].rank : i + 1;
  });
  entries.forEach((e) => {
    if (['absent', 'disqualified'].includes(e.status)) e.rank = undefined;
  });
  return maxTotal;
}

// Link entries to accounts from the emails / usernames the organiser typed.
async function resolveIdentities(entries) {
  const wanted = [...new Set(entries.flatMap((e) => e.identities || []).map((v) => v.toLowerCase().replace(/^@/, '')))];
  if (!wanted.length) return;
  const users = await User.find({ $or: [{ email: { $in: wanted } }, { username: { $in: wanted } }] }).select('_id email username').lean();
  const byKey = new Map();
  users.forEach((u) => {
    byKey.set(u.email, u._id);
    if (u.username) byKey.set(u.username, u._id);
  });
  entries.forEach((e) => {
    const found = (e.identities || []).map((v) => byKey.get(v.toLowerCase().replace(/^@/, ''))).filter(Boolean);
    const ids = new Map([...(e.users || []), ...found].map((id) => [String(id), id]));
    e.users = [...ids.values()];
  });
}

// ---------- Validation ----------

function validate(body) {
  const criteria = (Array.isArray(body.criteria) ? body.criteria : [])
    .map((c, i) => ({
      key: clean(c?.key, 24) || keyFor(c?.name, i),
      name: clean(c?.name, 60),
      description: clean(c?.description, 240),
      maxMarks: Math.round(Math.min(1000, Math.max(1, Number(c?.maxMarks) || 0)) * 100) / 100,
    }))
    .filter((c) => c.name)
    .slice(0, MAX_CRITERIA);
  const keys = new Set();
  criteria.forEach((c, i) => {
    if (keys.has(c.key)) c.key = `${c.key}x${i}`;
    keys.add(c.key);
  });

  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  if (rawEntries.length > MAX_ENTRIES) return { error: `A result board can hold up to ${MAX_ENTRIES} entries.` };
  const maxBy = new Map(criteria.map((c) => [c.key, c.maxMarks]));
  let badMarks = '';
  const entries = rawEntries
    .map((e) => ({
      ...(isId(e?.id) ? { _id: e.id } : {}),
      name: clean(e?.name, 100),
      subtitle: clean(e?.subtitle, 120),
      members: (Array.isArray(e?.members) ? e.members : String(e?.members || '').split(','))
        .map((m) => clean(m, 80)).filter(Boolean).slice(0, 12),
      users: (Array.isArray(e?.users) ? e.users : []).filter(isId).slice(0, 12),
      identities: (Array.isArray(e?.identities) ? e.identities : String(e?.identities || '').split(/[,\s]+/))
        .map((v) => clean(v, 200)).filter(Boolean).slice(0, 12),
      scores: criteria
        .map((c) => {
          const raw = e?.scores?.[c.key] ?? (Array.isArray(e?.scores) ? e.scores.find((s) => s?.key === c.key)?.marks : undefined);
          const marks = num(raw);
          if (marks === null) return null;
          if (marks < 0 || marks > maxBy.get(c.key)) badMarks = badMarks || `${clean(e?.name, 60) || 'An entry'}: ${c.name} must be between 0 and ${c.maxMarks}.`;
          return { key: c.key, marks: round2(marks) };
        })
        .filter(Boolean),
      adjustment: round2(Math.max(-1000, Math.min(1000, num(e?.adjustment) || 0))),
      status: STATUSES.includes(e?.status) ? e.status : '',
      award: clean(e?.award, 80),
      remarks: clean(e?.remarks, 600),
    }))
    .filter((e) => e.name);

  const passPercent = num(body.passPercent);
  const data = {
    title: clean(body.title, 120),
    category: CATEGORIES.includes(body.category) ? body.category : 'other',
    organization: clean(body.organization, 100) || 'CodeSphere',
    summary: clean(body.summary, 300),
    notes: clean(body.notes, 4000),
    heldOn: toDate(body.heldOn),
    visibility: VISIBILITY.includes(body.visibility) ? body.visibility : 'full',
    passPercent: passPercent === null ? undefined : Math.max(0, Math.min(100, passPercent)),
    criteria,
    entries,
  };
  if (body.source?.kind && ['hackathon', 'recruitment'].includes(body.source.kind) && isId(body.source.id)) {
    data.source = { kind: body.source.kind, id: body.source.id, slug: clean(body.source.slug, 120) };
  }

  if (data.title.length < 4) return { error: 'Give the result a title (at least 4 characters).' };
  if (!criteria.length) return { error: 'Add at least one marking criterion with its maximum marks.' };
  if (badMarks) return { error: badMarks };
  return { data };
}

// ---------- Views ----------

const CATEGORY_NOUN = { hackathon: 'teams', interview: 'candidates' };

function stats(r) {
  const scored = r.entries.filter((e) => e.rank);
  const maxTotal = r.criteria.reduce((sum, c) => sum + c.maxMarks, 0);
  const totals = scored.map((e) => e.total);
  const qualified = r.passPercent !== undefined && r.passPercent !== null
    ? scored.filter((e) => e.percent >= r.passPercent).length
    : null;
  return {
    participants: r.entries.length,
    maxTotal,
    highest: totals.length ? Math.max(...totals) : 0,
    average: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    lowest: totals.length ? Math.min(...totals) : 0,
    qualified,
    // Average % per criterion, for the scheme chart.
    criteriaAverages: r.criteria.map((c) => {
      const marks = r.entries.map((e) => e.scores.find((s) => s.key === c.key)?.marks).filter((m) => m !== undefined);
      return { key: c.key, average: marks.length ? round2(marks.reduce((a, b) => a + b, 0) / marks.length) : 0 };
    }),
  };
}

function entryView(e, { withScores = true, withPrivate = false } = {}) {
  return {
    id: String(e._id),
    name: e.name,
    subtitle: e.subtitle,
    members: e.members || [],
    status: e.status,
    award: e.award,
    total: e.total,
    percent: e.percent,
    rank: e.rank ?? null,
    ...(withScores ? {
      scores: Object.fromEntries((e.scores || []).map((s) => [s.key, s.marks])),
      adjustment: e.adjustment || 0,
      remarks: e.remarks,
    } : {}),
    ...(withPrivate ? {
      users: (e.users || []).map(String),
      identities: e.identities || [],
    } : {}),
  };
}

const sortedEntries = (r) => [...r.entries].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));

function card(r) {
  const s = stats(r);
  return {
    id: String(r._id),
    slug: r.slug,
    title: r.title,
    category: r.category,
    organization: r.organization,
    summary: r.summary,
    heldOn: r.heldOn,
    visibility: r.visibility,
    status: r.status,
    publishedAt: r.publishedAt,
    updatedAt: r.updatedAt,
    criteriaCount: r.criteria.length,
    participants: s.participants,
    maxTotal: s.maxTotal,
    highest: s.highest,
    average: s.average,
    noun: CATEGORY_NOUN[r.category] || 'participants',
    top: r.visibility === 'private' ? [] : sortedEntries(r).filter((e) => e.rank).slice(0, 3)
      .map((e) => ({ name: e.name, rank: e.rank, total: e.total, award: e.award })),
  };
}

const mineIn = (r, userId) => r.entries.find((e) => (e.users || []).some((u) => String(u) === String(userId)));

// ---------- Organiser routes ----------

// GET /api/results/admin/all
router.get('/admin/all', organizer, async (req, res) => {
  const list = await Result.find({}).sort({ updatedAt: -1 }).lean();
  res.json({ results: list.map(card) });
});

// GET /api/results/admin/sources: hackathons and recruitments to import from.
router.get('/admin/sources', organizer, async (req, res) => {
  const [hackathons, recruitments] = await Promise.all([
    Hackathon.find({ status: 'published' }).select('title slug submissionEnd').sort({ submissionEnd: -1 }).limit(50).lean(),
    Recruitment.find({ status: { $in: ['published', 'closed'] } }).select('title slug organization type applyBy').sort({ applyBy: -1 }).limit(50).lean(),
  ]);
  res.json({
    hackathons: hackathons.map((h) => ({ id: String(h._id), title: h.title, slug: h.slug, date: h.submissionEnd })),
    recruitments: recruitments.map((r) => ({ id: String(r._id), title: r.title, slug: r.slug, organization: r.organization, type: r.type, date: r.applyBy })),
  });
});

// GET /api/results/admin/import/hackathon/:id: teams with their submissions.
router.get('/admin/import/hackathon/:id', organizer, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  const h = await Hackathon.findById(req.params.id).lean();
  if (!h) return res.status(404).json({ message: 'Not found.' });
  const [teams, subs] = await Promise.all([
    HackathonTeam.find({ hackathon: h._id }).populate('members', 'name').lean(),
    HackathonSubmission.find({ hackathon: h._id, status: { $ne: 'draft' } }).lean(),
  ]);
  const subByTeam = new Map(subs.map((s) => [String(s.team), s]));
  const entries = teams.map((t) => {
    const s = subByTeam.get(String(t._id));
    return {
      name: t.name,
      subtitle: s?.title || 'No submission',
      members: (t.members || []).map((m) => m.name),
      users: (t.members || []).map((m) => String(m._id)),
      judgeScore: typeof s?.score === 'number' ? s.score : null,
      award: s?.award || '',
      status: s ? (s.review === 'rejected' ? 'not-qualified' : s.review === 'shortlisted' ? 'shortlisted' : '') : 'absent',
      remarks: s?.judgeNote || '',
    };
  });
  res.json({
    source: { kind: 'hackathon', id: String(h._id), slug: h.slug },
    title: `${h.title}: Results`,
    heldOn: h.submissionEnd,
    entries,
  });
});

// GET /api/results/admin/import/recruitment/:id: applicants and their status.
router.get('/admin/import/recruitment/:id', organizer, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  const r = await Recruitment.findById(req.params.id).lean();
  if (!r) return res.status(404).json({ message: 'Not found.' });
  const apps = await RecruitmentApplication.find({ recruitment: r._id, status: { $ne: 'withdrawn' } })
    .populate('user', 'name').sort({ createdAt: 1 }).lean();
  const statusMap = { selected: 'selected', shortlisted: 'shortlisted', rejected: 'not-selected', applied: '' };
  res.json({
    source: { kind: 'recruitment', id: String(r._id), slug: r.slug },
    title: `${r.organization}: ${r.title} results`,
    organization: r.organization,
    heldOn: r.applyBy,
    entries: apps.filter((a) => a.user).map((a) => ({
      name: a.user.name,
      subtitle: a.role || '',
      members: [],
      users: [String(a.user._id)],
      status: statusMap[a.status] || '',
    })),
  });
});

// GET /api/results/admin/:id
router.get('/admin/:id', organizer, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  const r = await Result.findById(req.params.id).lean();
  if (!r) return res.status(404).json({ message: 'Not found.' });
  res.json({
    result: {
      ...card(r),
      notes: r.notes,
      passPercent: r.passPercent ?? null,
      criteria: r.criteria,
      source: r.source?.kind ? { kind: r.source.kind, id: String(r.source.id), slug: r.source.slug } : null,
      entries: sortedEntries(r).map((e) => entryView(e, { withPrivate: true })),
    },
  });
});

async function save(req, res) {
  const { data, error } = validate(req.body || {});
  if (error) return res.status(400).json({ message: error });

  let r;
  if (req.params.id) {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
    r = await Result.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Not found.' });
  } else {
    r = new Result({ slug: slugify(data.title), createdBy: req.user._id });
  }

  await resolveIdentities(data.entries);
  computeStandings(data.criteria, data.entries);
  Object.assign(r, data);
  if (data.passPercent === undefined) r.passPercent = undefined;
  await r.save();
  return res.status(req.params.id ? 200 : 201).json({ id: String(r._id), slug: r.slug, unlinked: data.entries.filter((e) => e.identities.length && !e.users.length).map((e) => e.name) });
}

router.post('/admin', organizer, save);
router.put('/admin/:id', organizer, save);

// POST /api/results/admin/:id/publish { publish, notify }
router.post('/admin/:id/publish', organizer, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  const r = await Result.findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found.' });
  const publish = req.body.publish !== false;
  if (publish && !r.entries.length) return res.status(400).json({ message: 'Add at least one participant before publishing.' });
  const firstTime = publish && !r.publishedAt;
  r.status = publish ? 'published' : 'draft';
  if (publish && !r.publishedAt) r.publishedAt = new Date();
  await r.save();

  // Tell each linked participant their result is out.
  if (publish && req.body.notify !== false) {
    const maxTotal = r.criteria.reduce((sum, c) => sum + c.maxMarks, 0);
    await Promise.all(r.entries.filter((e) => e.users?.length).map((e) => notify(e.users, {
      type: 'result',
      title: `${firstTime ? 'Results are out' : 'Results updated'}: ${r.title}`.slice(0, 200),
      body: `${e.rank ? `Rank ${e.rank} of ${r.entries.length} · ` : ''}${e.total}/${maxTotal} (${e.percent}%)${e.award ? ` · ${e.award}` : ''}`.slice(0, 400),
      link: `/results/${r.slug}`,
    })));
  }
  res.json({ status: r.status });
});

// DELETE /api/results/admin/:id
router.delete('/admin/:id', organizer, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  await Result.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

// ---------- Member routes ----------

// GET /api/results?category=hackathon
router.get('/', protect, async (req, res) => {
  const filter = { status: 'published' };
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  const list = await Result.find(filter).sort({ heldOn: -1, publishedAt: -1 }).limit(200).lean();
  const counts = await Result.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  res.json({
    results: list.map((r) => ({ ...card(r), mine: Boolean(mineIn(r, req.user._id)) })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
});

// GET /api/results/mine: the signed-in member's own results.
router.get('/mine', protect, async (req, res) => {
  const list = await Result.find({ status: 'published', 'entries.users': req.user._id }).sort({ heldOn: -1, publishedAt: -1 }).lean();
  res.json({
    results: list.map((r) => {
      const e = mineIn(r, req.user._id);
      return {
        ...card(r),
        criteria: r.criteria,
        passPercent: r.passPercent ?? null,
        average: stats(r).average,
        entry: entryView(e),
      };
    }),
  });
});

// GET /api/results/:slug
router.get('/:slug', protect, async (req, res) => {
  const r = await Result.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
  const staff = req.user.role === 'admin' || req.user.staffRoles?.includes('hackathon-organizer');
  if (!r || (r.status !== 'published' && !staff)) return res.status(404).json({ message: 'This result isn\'t available.' });

  const mine = mineIn(r, req.user._id);
  const full = r.visibility === 'full' || staff;
  const entries = r.visibility === 'private' && !staff
    ? []
    : sortedEntries(r).map((e) => entryView(e, { withScores: full }));

  res.json({
    result: {
      ...card(r),
      notes: r.notes,
      passPercent: r.passPercent ?? null,
      criteria: r.criteria.map(({ key, name, description, maxMarks }) => ({ key, name, description, maxMarks })),
      source: r.source?.kind ? { kind: r.source.kind, slug: r.source.slug } : null,
      stats: stats(r),
      entries,
      mine: mine ? entryView(mine) : null,
      canManage: staff,
    },
  });
});

module.exports = router;
