// Validate the aptitude question bank: structure, duplicates, topics, and
// every `verify` expression recomputed against the marked answer.
// Usage (from server/): node scripts/checkAptitude.js
const { raw, prepared } = require('../data/aptitudeQuestions');
const { topicIndex, DIFFICULTIES } = require('../data/aptitudeTopics');

const problems = [];
const codes = new Set();
const statements = new Set();
const number = (text) => {
  const m = String(text).replace(/[,₹]/g, '').match(/−?-?\d+(\.\d+)?/);
  return m ? Number(m[0].replace('−', '-')) : NaN;
};

raw.forEach((q) => {
  const where = q.code || '(no code)';
  if (!q.code || !/^[A-Z]{2}-[A-Z]+-\d{3}$/.test(q.code)) problems.push(`${where}: bad code`);
  if (codes.has(q.code)) problems.push(`${where}: duplicate code`);
  codes.add(q.code);
  const key = q.statement.toLowerCase().replace(/\s+/g, ' ').trim();
  if (statements.has(key)) problems.push(`${where}: duplicate statement`);
  statements.add(key);
  const topic = topicIndex.get(q.topic);
  if (!topic) problems.push(`${where}: unknown topic "${q.topic}"`);
  else if (topic.category !== q.category) problems.push(`${where}: topic "${q.topic}" is not in ${q.category}`);
  if (!DIFFICULTIES.includes(q.difficulty)) problems.push(`${where}: bad difficulty`);
  if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`${where}: needs 4 options`);
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) problems.push(`${where}: duplicate options`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${where}: answer out of range`);
  if (!q.explanation || q.explanation.length < 20) problems.push(`${where}: explanation too short`);
  if (!q.estimatedSeconds) problems.push(`${where}: missing estimated time`);
  if (q.verify) {
    let value;
    try {
      // eslint-disable-next-line no-new-func
      value = Function(`"use strict"; return (${q.verify});`)();
    } catch (e) {
      problems.push(`${where}: verify failed to run (${e.message})`);
      return;
    }
    const marked = q.options[q.answer];
    const ok = typeof value === 'number'
      ? Math.abs(value - number(marked)) < 0.01
      : String(value).trim().toLowerCase() === String(marked).trim().toLowerCase().replace(/^(\d+)$/, '$1');
    if (!ok) problems.push(`${where}: verify gives ${value}, but the marked answer is "${marked}"`);
    // No other option may also match the computed value.
    if (typeof value === 'number') {
      q.options.forEach((o, i) => {
        if (i !== q.answer && Math.abs(value - number(o)) < 0.01) problems.push(`${where}: option "${o}" also matches ${value}`);
      });
    }
  }
});

// The shuffled copy must still point at the same answer text.
prepared().forEach((p, i) => {
  if (p.options[p.answer] !== raw[i].options[raw[i].answer]) problems.push(`${p.code}: shuffle broke the answer`);
});

const count = (key) => raw.reduce((m, q) => ({ ...m, [q[key]]: (m[q[key]] || 0) + 1 }), {});
const positions = prepared().reduce((m, q) => ({ ...m, [q.answer]: (m[q.answer] || 0) + 1 }), {});
console.log(`Questions: ${raw.length}`);
console.log('By category:', count('category'));
console.log('By difficulty:', count('difficulty'));
console.log('Verified numerically:', raw.filter((q) => q.verify).length);
console.log('Correct option position after shuffle (A=0…D=3):', positions);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log('\nAll questions are valid.');
