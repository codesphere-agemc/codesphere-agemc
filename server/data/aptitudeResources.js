// External places to keep learning, shown on Aptitude topic pages, the
// dashboard and placement tracks. We only link to these sites; their
// questions and notes stay on their sites. Every URL is checked by
// scripts/checkAptitudeLinks.js.

const SITES = {
  indiabix: { name: 'IndiaBix', cost: 'Free', kind: 'Practice questions' },
  gfg: { name: 'GeeksforGeeks', cost: 'Free', kind: 'Notes and solved questions' },
  prepinsta: { name: 'PrepInsta', cost: 'Free + paid', kind: 'Company-wise patterns' },
  m4maths: { name: 'm4maths', cost: 'Free', kind: 'Student-shared placement questions' },
  lofoya: { name: 'Lofoya', cost: 'Free', kind: 'Practice questions' },
  careerride: { name: 'CareerRide', cost: 'Free', kind: 'Online aptitude tests' },
  khan: { name: 'Khan Academy', cost: 'Free', kind: 'Lessons on the basics' },
  youtube: { name: 'YouTube', cost: 'Free', kind: 'Video lessons' },
};

const IB = (path) => ({ site: 'indiabix', url: `https://www.indiabix.com/${path}/` });
const GFG = (slug) => ({ site: 'gfg', url: `https://www.geeksforgeeks.org/aptitude/${slug}/` });

// Topic slug → links (most specific first).
const TOPICS = {
  // Quantitative
  'number-system': [IB('aptitude/numbers'), GFG('numbers-in-aptitude')],
  simplification: [IB('aptitude/simplification'), GFG('simplification-and-approximation-solved-questions-and-answers')],
  'hcf-and-lcm': [IB('aptitude/problems-on-hcf-and-lcm'), GFG('hcf-and-lcm-aptitude-questions')],
  percentage: [IB('aptitude/percentage'), GFG('percentage-aptitude-questions')],
  'profit-and-loss': [IB('aptitude/profit-and-loss'), GFG('profit-and-loss-questions-aptitude')],
  'simple-interest': [IB('aptitude/simple-interest'), GFG('simple-interest-questions-aptitude')],
  'compound-interest': [IB('aptitude/compound-interest')],
  'ratio-and-proportion': [IB('aptitude/ratio-and-proportion'), GFG('ratio-and-proportion-aptitude-questions')],
  average: [IB('aptitude/average'), GFG('average-aptitude-questions-answers')],
  'problems-on-ages': [IB('aptitude/problems-on-ages'), GFG('problems-on-ages-aptitude')],
  'time-and-work': [IB('aptitude/time-and-work'), GFG('work-and-wages-aptitude-questions-and-answers')],
  'pipes-and-cisterns': [IB('aptitude/pipes-and-cistern'), GFG('pipes-and-cisterns-aptitude-questions-and-answers')],
  'time-speed-and-distance': [IB('aptitude/time-and-distance'), IB('aptitude/races-and-games'), GFG('speed-time-distance-aptitude-questions-and-answers')],
  trains: [IB('aptitude/problems-on-trains'), GFG('speed-time-distance')],
  'boats-and-streams': [IB('aptitude/boats-and-streams'), GFG('boats-and-streams-aptitude-questions')],
  'mixtures-and-alligation': [IB('aptitude/alligation-or-mixture'), GFG('alligation-or-mixture-aptitude-questions')],
  partnership: [IB('aptitude/partnership')],
  probability: [IB('aptitude/probability'), GFG('probability-questions'), { site: 'khan', url: 'https://www.khanacademy.org/math/statistics-probability' }],
  'permutation-and-combination': [IB('aptitude/permutation-and-combination'), GFG('permutation-and-combination-questions')],
  progressions: [GFG('progression-aptitude-questions')],
  geometry: [GFG('geometry-aptitude-questions-answers'), IB('aptitude/height-and-distance')],
  mensuration: [IB('aptitude/area'), IB('aptitude/volume-and-surface-area'), GFG('mensuration-2d')],
  algebra: [IB('aptitude/surds-and-indices'), IB('aptitude/logarithm'), { site: 'khan', url: 'https://www.khanacademy.org/math/pre-algebra' }],

  // Logical reasoning
  'number-series': [IB('logical-reasoning/number-series'), GFG('number-series-solved-questions-and-answers')],
  'alphabet-series': [IB('logical-reasoning/letter-and-symbol-series'), GFG('letter-series-reasoning-questions')],
  'coding-and-decoding': [GFG('reasoning-tricks-to-solve-coding-decoding'), IB('logical-reasoning/artificial-language')],
  'blood-relations': [IB('verbal-reasoning/blood-relation-test'), GFG('blood-relation-solved-questions-and-answers')],
  'direction-sense': [IB('verbal-reasoning/direction-sense-test'), GFG('direction-sense-solved-questions-and-answers')],
  'seating-arrangement': [IB('verbal-reasoning/seating-arrangement'), GFG('puzzles')],
  puzzles: [IB('logical-reasoning/logical-games'), GFG('top-100-puzzles-asked-in-interviews'), { site: 'm4maths', url: 'https://m4maths.com/placement-puzzles.php' }],
  syllogism: [IB('verbal-reasoning/syllogism'), GFG('logical-deduction-solved-questions-and-answers')],
  'statement-and-conclusion': [IB('logical-reasoning/statement-and-conclusion'), GFG('statement-and-conclusion-solved-questions-and-answers')],
  'statement-and-assumption': [IB('logical-reasoning/statement-and-assumption'), GFG('statement-and-assumption')],
  analogy: [IB('verbal-reasoning/analogy'), GFG('analogy-solved-questions-and-answers')],
  classification: [IB('verbal-reasoning/classification'), GFG('classification-solved-questions-and-answers')],
  'odd-one-out': [IB('aptitude/odd-man-out-and-series'), IB('logical-reasoning/verbal-classification')],
  'ranking-and-ordering': [IB('verbal-reasoning/arithmetic-reasoning'), GFG('logical-problems-solved-question-and-answer')],
  calendar: [IB('aptitude/calendar'), GFG('calendar-questions-aptitude-and-reasoning')],
  clock: [IB('aptitude/clock'), GFG('clock-questions-aptitude')],
  'venn-diagrams': [IB('verbal-reasoning/venn-diagrams'), GFG('venn-diagrams-solved-questions-and-answers')],
  'logical-sequence': [IB('verbal-reasoning/logical-sequence-of-words'), IB('verbal-reasoning/series-completion')],
  'data-sufficiency': [IB('verbal-reasoning/data-sufficiency')],
  'non-verbal-reasoning': [IB('verbal-reasoning/cube-and-cuboid'), IB('verbal-reasoning/dice'), GFG('non-verbal-reasoning-paper-folding')],

  // Verbal ability
  'reading-comprehension': [IB('verbal-ability/comprehension'), GFG('reading-comprehension-solved-questions-and-answers')],
  synonyms: [IB('verbal-ability/synonyms'), GFG('synonyms-solved-questions-and-answers')],
  antonyms: [IB('verbal-ability/antonyms'), GFG('antonyms-solved-questions-and-answers')],
  'sentence-correction': [IB('verbal-ability/sentence-correction'), GFG('sentence-correction-solved-question-and-answer')],
  'error-detection': [IB('verbal-ability/spotting-errors'), GFG('spotting-errors-solved-questions-and-answers')],
  'fill-in-the-blanks': [IB('verbal-ability/selecting-words'), IB('verbal-ability/closet-test'), GFG('cloze-test-solved-questions-and-answers')],
  'para-jumbles': [IB('verbal-ability/ordering-of-sentences'), GFG('para-jumbles-solved-questions-and-answers')],
  'sentence-completion': [IB('verbal-ability/completing-statements'), GFG('sentence-completion-solved-questions-and-answers')],
  'active-and-passive-voice': [IB('verbal-ability/change-of-voice'), GFG('change-of-voice-solved-questions-and-answers')],
  'direct-and-indirect-speech': [IB('verbal-ability/change-of-speech'), GFG('change-of-speech-solved-questions-and-answers')],
  'idioms-and-phrases': [IB('verbal-ability/idioms-and-phrases'), GFG('idioms-and-phrases-solved-questions-and-answers')],
  'one-word-substitution': [IB('verbal-ability/one-word-substitutes'), GFG('one-word-substitutes-solved-questions-and-answers')],
  vocabulary: [IB('verbal-ability/verbal-analogies'), IB('verbal-ability/spellings'), GFG('verbal-analogies-solved-questions-and-answers')],
  grammar: [GFG('preposition-solved-questions-and-answers'), GFG('article-solved-questions-and-answer'), GFG('adjective-solved-questions-and-answers')],
  'sentence-improvement': [IB('verbal-ability/sentence-improvement'), GFG('sentence-improvement-solved-questions-and-answers')],

  // Data interpretation
  tables: [IB('data-interpretation/table-charts'), GFG('data-interpretation-questions-aptitude')],
  'bar-graphs': [IB('data-interpretation/bar-charts'), GFG('data-interpretation-questions-aptitude')],
  'pie-charts': [IB('data-interpretation/pie-charts'), GFG('data-interpretation-questions-aptitude')],
  'line-graphs': [IB('data-interpretation/line-charts'), GFG('data-interpretation-questions-aptitude')],
  'caselet-based-questions': [GFG('data-interpretation-1')],
  'mixed-graphs': [GFG('data-interpretation-questions-aptitude'), IB('data-interpretation/questions-and-answers')],
  'data-comparison': [IB('data-interpretation/table-charts'), GFG('data-interpretation-1')],
};

// Whole-category starting points (dashboard).
const CATEGORY_LINKS = {
  quantitative: [IB('aptitude/questions-and-answers'), GFG('aptitude-questions-and-answers'), { site: 'prepinsta', url: 'https://prepinsta.com/quants/' }],
  logical: [IB('logical-reasoning/questions-and-answers'), IB('verbal-reasoning/questions-and-answers'), GFG('logical-problems-logical-reasoning-questions-and-answers')],
  verbal: [IB('verbal-ability/questions-and-answers'), GFG('sentence-correction-verbal-ability'), { site: 'prepinsta', url: 'https://prepinsta.com/verbal-ability/' }],
  'data-interpretation': [IB('data-interpretation/questions-and-answers'), GFG('data-interpretation-questions-aptitude')],
};

// More general places: full tests, puzzles, videos.
const GENERAL = [
  { site: 'careerride', url: 'https://www.careerride.com/online-aptitude-test.aspx', label: 'Timed online aptitude tests' },
  { site: 'lofoya', url: 'https://www.lofoya.com/', label: 'Topic-wise practice with solutions' },
  { site: 'm4maths', url: 'https://m4maths.com/', label: 'Questions shared by students after placement tests' },
  { site: 'youtube', url: 'https://www.youtube.com/@FeelFreetoLearn', label: 'Feel Free to Learn: aptitude shortcuts by topic' },
  { site: 'youtube', url: 'https://www.youtube.com/@AptitudeCracker', label: 'Aptitude Cracker: placement-paper walkthroughs' },
];

// Placement track → the company's pattern page.
const TRACKS = {
  'tcs-nqt': [{ site: 'prepinsta', url: 'https://prepinsta.com/tcs-nqt/' }],
  infosys: [{ site: 'prepinsta', url: 'https://prepinsta.com/infosys/' }],
  wipro: [{ site: 'prepinsta', url: 'https://prepinsta.com/wipro/' }],
  accenture: [{ site: 'prepinsta', url: 'https://prepinsta.com/accenture-previous-papers/' }],
  cognizant: [{ site: 'prepinsta', url: 'https://prepinsta.com/cognizant/' }],
  capgemini: [{ site: 'prepinsta', url: 'https://prepinsta.com/capgemini/' }],
  deloitte: [{ site: 'prepinsta', url: 'https://prepinsta.com/deloitte/' }],
  general: [IB('aptitude/questions-and-answers'), GFG('aptitude-test')],
};

const withSite = (link) => ({ ...SITES[link.site], ...link });
const linksFor = (map, key) => (map[key] || []).map(withSite);

module.exports = {
  SITES,
  topicLinks: (slug) => linksFor(TOPICS, slug),
  categoryLinks: (slug) => linksFor(CATEGORY_LINKS, slug),
  trackLinks: (slug) => linksFor(TRACKS, slug),
  generalLinks: () => GENERAL.map(withSite),
  allUrls: () => [...new Set([...Object.values(TOPICS), ...Object.values(CATEGORY_LINKS), ...Object.values(TRACKS), GENERAL].flat().map((l) => l.url))],
  TOPICS,
};
