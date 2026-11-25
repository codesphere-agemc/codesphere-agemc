// Public counts for the landing page's "Explore CodeSphere" section.
// GET /api/stats/landing — no sign-in needed; cached for 5 minutes.
const express = require('express');
const User = require('../models/User');
const Event = require('../models/Event');
const UserBadge = require('../models/UserBadge');
const DebugProgress = require('../models/DebugProgress');
const StudyGuide = require('../models/StudyGuide');
const { Project, GuidedProject } = require('../models/Project');
const { ForumThread } = require('../models/Forum');
const { ReverseChallenge } = require('../models/Reverse');
const { Hackathon, ExternalHackathon } = require('../models/Hackathon');
const { NewsDigest } = require('../models/News');

const router = express.Router();
const CACHE_MS = 5 * 60 * 1000;
let cached = null;

// One failing count shouldn't hide the rest.
const safe = (promise) => promise.catch(() => null);

router.get('/landing', async (req, res) => {
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json(cached.body);
  const now = new Date();
  const [
    members, upcomingEvents, projects, guidedProjects, threads, challenges,
    hackathons, externalHackathons, guides, digests, badges, bugsSolved,
  ] = await Promise.all([
    safe(User.countDocuments({ role: 'user' })),
    safe(Event.countDocuments({ status: 'published', date: { $gte: now } })),
    safe(Project.countDocuments({ visibility: 'public' })),
    safe(GuidedProject.countDocuments({ status: 'published' })),
    safe(ForumThread.countDocuments({ status: 'visible' })),
    safe(ReverseChallenge.countDocuments({ status: 'published' })),
    safe(Hackathon.countDocuments({ status: 'published' })),
    safe(ExternalHackathon.countDocuments({ $or: [{ endsAt: { $gte: now } }, { endsAt: null }] })),
    safe(StudyGuide.countDocuments({ status: 'published' })),
    safe(NewsDigest.countDocuments({ status: 'published' })),
    safe(UserBadge.countDocuments({})),
    safe(DebugProgress.countDocuments({})),
  ]);

  const body = {
    success: true,
    stats: {
      members,
      upcomingEvents,
      projects,
      guidedProjects,
      threads,
      challenges,
      hackathons: (hackathons || 0) + (externalHackathons || 0),
      guides,
      digests,
      badges,
      bugsSolved,
    },
  };
  cached = { at: Date.now(), body };
  return res.json(body);
});

// GET /api/stats/recent: the latest things happening in the community
// (events, hackathons, recruitments/interviews, announcements, projects),
// newest first, for the "Recent updates" strip on the home page. Cached 5 min.
const { Recruitment } = require('../models/Recruitment');
const Announcement = require('../models/Announcement');
const Result = require('../models/Result');

let recentCache = null;
// Rebuilt at most every 2 minutes, so new posts show up quickly.
const RECENT_CACHE_MS = 2 * 60 * 1000;
const stripHtml = (html = '') => String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const clip = (text = '', n = 120) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

router.get('/recent', async (req, res) => {
  if (recentCache && Date.now() - recentCache.at < RECENT_CACHE_MS) return res.json(recentCache.body);
  const take = 6;
  const [events, hackathons, recruitments, announcements, projects, guides, puzzles, guided, digests, results] = await Promise.all([
    safe(Event.find({ status: 'published' }).sort({ createdAt: -1 }).limit(take).lean()),
    safe(Hackathon.find({ status: 'published' }).sort({ createdAt: -1 }).limit(take).lean()),
    safe(Recruitment.find({ status: { $in: ['published', 'closed'] } }).sort({ updatedAt: -1 }).limit(take).lean()),
    safe(Announcement.find({ $or: [{ audience: '@all' }, { audience: { $exists: false } }] }).sort({ publishedAt: -1 }).limit(take).lean()),
    safe(Project.find({ status: 'published', visibility: 'public' }).sort({ publishedAt: -1 }).limit(take).lean()),
    safe(StudyGuide.find({ status: 'published' }).sort({ createdAt: -1 }).limit(take).lean()),
    safe(ReverseChallenge.find({ status: 'published', $or: [{ publishedAt: null }, { publishedAt: { $lte: new Date() } }] }).sort({ publishedAt: -1, createdAt: -1 }).limit(take).lean()),
    safe(GuidedProject.find({ status: 'published' }).sort({ createdAt: -1 }).limit(take).lean()),
    safe(NewsDigest.find({ status: 'published', publishedAt: { $lte: new Date() } }).sort({ publishedAt: -1 }).limit(take).lean()),
    safe(Result.find({ status: 'published' }).select('slug title summary organization banner publishedAt').sort({ publishedAt: -1 }).limit(take).lean()),
  ]);

  const now = new Date();
  const before = (d) => Boolean(d) && new Date(d) < now;
  // 'ended' puts an Ended/Closed note on the card's banner.
  const items = [
    ...(events || []).map((e) => ({
      ended: before(e.endDate || e.date) ? 'Ended' : '',
      kind: 'event', label: e.category || 'Event', title: e.title, image: e.bannerImage?.url || '',
      text: clip(stripHtml(e.description)), meta: e.date, at: e.createdAt, link: `/events/${e.slug}`,
    })),
    ...(hackathons || []).map((h) => ({
      ended: h.resultsPublished || before(h.submissionEnd) ? 'Ended' : '',
      kind: 'hackathon', label: 'Hackathon', title: h.title, image: h.bannerUrl || '',
      text: clip(h.tagline || stripHtml(h.description)), meta: h.regEnd, at: h.createdAt, link: `/hackathons/${h.slug}`,
    })),
    ...(recruitments || []).map((r) => ({
      ended: r.status === 'closed' || before(r.applyBy) ? 'Closed' : '',
      kind: 'recruitment', label: r.type === 'interview' ? 'Interview' : 'Recruitment', title: `${r.organization}: ${r.title}`, image: r.banner?.url || '',
      text: clip(r.summary || stripHtml(r.description)), meta: r.applyBy, at: r.reviewedAt || r.createdAt, link: `/recruitments/${r.slug}`,
    })),
    ...(announcements || []).map((a) => ({
      kind: 'update', label: 'Announcement', title: a.title, image: (a.attachments || []).find((f) => f.type === 'image')?.url || '',
      text: clip(stripHtml(a.body)), meta: null, at: a.publishedAt || a.createdAt, link: `/updates/${a._id}`,
    })),
    ...(results || []).map((r) => ({
      kind: 'result', label: 'Results', title: r.title, image: r.banner?.url || '',
      text: clip(r.summary || `Results from ${r.organization || 'CodeSphere'} are out.`), meta: null, at: r.publishedAt, link: `/results/${r.slug}`,
    })),
    ...(guides || []).map((g) => ({
      kind: 'guide', label: 'Study guide', title: g.title, image: '',
      text: clip(g.summary), meta: null, at: g.createdAt, link: `/materials/${g.slug}`,
    })),
    ...(puzzles || []).map((c) => ({
      kind: 'puzzle', label: 'Reverse coding', title: c.title, image: '',
      text: clip(stripHtml(c.statement)), meta: null, at: c.publishedAt || c.createdAt, link: `/reverse-coding/${c.slug}`,
    })),
    ...(guided || []).map((g) => ({
      kind: 'guided', label: 'Guided project', title: g.title, image: '',
      text: clip(g.summary || ''), meta: null, at: g.createdAt, link: `/projects/guided/${g.slug}`,
    })),
    ...(digests || []).map((n) => ({
      kind: 'news', label: 'Tech Brief', title: n.title, image: '',
      text: clip(n.intro || ''), meta: null, at: n.publishedAt, link: `/news/${n.slug}`,
    })),
    ...(projects || []).map((p) => ({
      kind: 'project', label: 'Project', title: p.title, image: p.screenshots?.[0]?.url || '',
      text: clip(p.summary), meta: null, at: p.publishedAt || p.createdAt, link: `/projects/${p.slug}`,
    })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, take);

  const body = { success: true, items };
  recentCache = { at: Date.now(), body };
  return res.json(body);
});

module.exports = router;
