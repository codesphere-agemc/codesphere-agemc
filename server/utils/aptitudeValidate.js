// Checks and cleans an aptitude question coming from the admin editor or a
// bulk import. Returns { value, errors } — errors are plain sentences.
const { DIFFICULTIES, PLACEMENT_TRACKS, topicIndex } = require('../data/aptitudeTopics');

const CODE_RE = /^[A-Z]{2}-[A-Z0-9]{1,6}-\d{3,4}$/;
const STATUSES = ['draft', 'published', 'archived'];
const CATEGORY_PREFIX = { quantitative: 'QA', logical: 'LR', verbal: 'VA', 'data-interpretation': 'DI' };
const TRACK_SLUGS = new Set(PLACEMENT_TRACKS.map((t) => t.slug));

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : str(v).split(/[|,;]/)).map(str).filter(Boolean);

// "B", "b", "2" (1-based) or 1 (0-based number from JSON) → index.
function answerIndex(v, optionCount, oneBased) {
  if (typeof v === 'number' && Number.isInteger(v)) return oneBased ? v - 1 : v;
  const s = str(v).toUpperCase().replace(/^OPTION\s*/, '');
  if (/^[A-F]$/.test(s)) return s.charCodeAt(0) - 65;
  if (/^\d+$/.test(s)) return Number(s) - 1; // text digits are 1-based ("1" = first)
  return -1;
}

const num = (v, def, min, max) => {
  if (v === '' || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
};

/**
 * input: question fields. Accepts topic by slug or name, options as an array or
 * optionA..optionF / option_a.., answer as index, letter or 1-based number.
 * opts.oneBasedNumbers: numeric answers are 1-based (spreadsheets).
 */
function validateQuestion(input = {}, opts = {}) {
  const errors = [];
  const pick = (...keys) => {
    for (const k of keys) if (input[k] !== undefined && input[k] !== null && str(input[k]) !== '') return input[k];
    return undefined;
  };

  // Topic (slug or display name).
  const rawTopic = str(pick('topic', 'Topic'));
  let topic = topicIndex.get(rawTopic.toLowerCase()) ? rawTopic.toLowerCase() : '';
  if (!topic && rawTopic) {
    const want = rawTopic.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (const [slug, t] of topicIndex) if (t.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === want) topic = slug;
  }
  if (!topic) errors.push(rawTopic ? `Unknown topic "${rawTopic}".` : 'Topic is required.');
  const category = topic ? topicIndex.get(topic).category : '';

  const statement = str(pick('statement', 'question', 'Question'));
  if (!statement) errors.push('Question text is required.');
  else if (statement.length > 4000) errors.push('Question text is over 4000 characters.');

  let options = Array.isArray(input.options) ? input.options.map(str) : ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => str(pick(`option${l.toUpperCase()}`, `option_${l}`, `option ${l}`, `Option ${l.toUpperCase()}`, l.toUpperCase())));
  // Drop trailing blanks (a sheet with 4 options leaves E and F empty).
  while (options.length && !options[options.length - 1]) options.pop();
  if (options.length < 2) errors.push('At least 2 options are needed.');
  if (options.length > 6) errors.push('At most 6 options are allowed.');
  if (options.some((o) => !o)) errors.push('An option in the middle is empty.');
  if (options.some((o) => o.length > 600)) errors.push('An option is over 600 characters.');
  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push('Two options are the same.');

  const rawAnswer = pick('answer', 'Answer', 'correct');
  const answer = rawAnswer === undefined ? -1 : answerIndex(rawAnswer, options.length, opts.oneBasedNumbers);
  if (rawAnswer === undefined) errors.push('Answer is required.');
  else if (answer < 0 || answer >= options.length) errors.push(`Answer "${str(rawAnswer)}" doesn't match an option.`);

  const explanation = str(pick('explanation', 'Explanation', 'solution'));
  if (!explanation) errors.push('Explanation is required.');

  const difficulty = str(pick('difficulty', 'Difficulty') || 'easy').toLowerCase().replace(/\s+/g, '-');
  if (!DIFFICULTIES.includes(difficulty)) errors.push(`Difficulty must be one of: ${DIFFICULTIES.join(', ')}.`);

  const status = str(pick('status', 'Status') || opts.defaultStatus || 'draft').toLowerCase();
  if (!STATUSES.includes(status)) errors.push('Status must be draft, published or archived.');

  const code = str(pick('code', 'Code')).toUpperCase();
  if (code && !CODE_RE.test(code)) errors.push(`Code "${code}" should look like QA-PCT-004.`);

  const estimatedSeconds = num(pick('estimatedSeconds', 'estimated_seconds', 'seconds'), 60, 10, 1800);
  const marks = num(pick('marks'), 1, 0, 20);
  const negativeMarks = num(pick('negativeMarks', 'negative_marks'), 0, 0, 20);
  if (Number.isNaN(estimatedSeconds)) errors.push('Time must be 10 to 1800 seconds.');
  if (Number.isNaN(marks) || Number.isNaN(negativeMarks)) errors.push('Marks must be between 0 and 20.');

  const tracks = list(pick('tracks') || []).map((t) => t.toLowerCase());
  const badTrack = tracks.find((t) => !TRACK_SLUGS.has(t));
  if (badTrack) errors.push(`Unknown placement track "${badTrack}".`);

  const hint = str(pick('hint', 'Hint'));
  const shortcut = str(pick('shortcut', 'Shortcut'));
  if (hint.length > 600) errors.push('Hint is over 600 characters.');
  if (shortcut.length > 1500) errors.push('Shortcut is over 1500 characters.');
  if (explanation.length > 6000) errors.push('Explanation is over 6000 characters.');

  return {
    errors,
    value: {
      code,
      title: str(pick('title')).slice(0, 140),
      statement,
      category,
      topic,
      difficulty,
      options,
      answer,
      hint,
      explanation,
      shortcut,
      marks,
      negativeMarks,
      estimatedSeconds,
      tags: list(pick('tags') || []).map((t) => t.toLowerCase().slice(0, 40)).slice(0, 12),
      tracks,
      status,
    },
  };
}

// Next free code for a topic, e.g. QA-PCT-004 (reuses the topic's existing prefix).
async function nextCode(Model, topic, taken = new Set()) {
  const { category } = topicIndex.get(topic);
  const prefix = CATEGORY_PREFIX[category];
  const existing = await Model.find({ topic }).select('code').lean();
  const fromBank = existing.map((q) => q.code.split('-')[1]).find(Boolean);
  const mid = fromBank || topic.split('-').filter((w) => w !== 'and').map((w) => w[0]).join('').toUpperCase().slice(0, 6);
  const re = new RegExp(`^${prefix}-${mid}-(\\d+)$`);
  const all = await Model.find({ code: { $regex: re } }).select('code').lean();
  let n = Math.max(0, ...all.map((q) => Number(q.code.match(re)[1])), ...[...taken].map((c) => Number((c.match(re) || [])[1]) || 0));
  let code;
  do {
    n += 1;
    code = `${prefix}-${mid}-${String(n).padStart(3, '0')}`;
  } while (taken.has(code));
  return code;
}

module.exports = { validateQuestion, nextCode, CODE_RE, STATUSES };
