// All seed questions, ready to insert. Option order is shuffled once, in a
// fixed way per question code, so the correct answer isn't always "A" but a
// re-seed never moves it.
const batch1 = require('./batch1');

const ALL = [...batch1];

function seededShuffle(items, seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function prepared() {
  return ALL.map((question) => {
    const order = seededShuffle(question.options, question.code);
    const options = order.map((i) => question.options[i]);
    const { verify, ...rest } = question;
    return { ...rest, options, answer: order.indexOf(question.answer), verify };
  });
}

module.exports = { raw: ALL, prepared };
