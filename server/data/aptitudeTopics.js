// Aptitude categories and topics. Questions point at a topic by its slug.
// Add or rename topics here; question data stays valid as long as slugs don't change.

const slug = (name) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const topics = (names) => names.map((name, order) => ({ slug: slug(name), name, order }));

const CATEGORIES = [
  {
    slug: 'quantitative',
    name: 'Quantitative Aptitude',
    short: 'Quant',
    icon: 'bi-calculator',
    color: '#f05a36',
    description: 'Arithmetic, algebra, geometry and number problems asked in every placement test.',
    topics: topics([
      'Number System', 'Simplification', 'HCF and LCM', 'Percentage', 'Profit and Loss', 'Simple Interest',
      'Compound Interest', 'Ratio and Proportion', 'Average', 'Problems on Ages', 'Time and Work',
      'Pipes and Cisterns', 'Time, Speed and Distance', 'Trains', 'Boats and Streams', 'Mixtures and Alligation',
      'Partnership', 'Probability', 'Permutation and Combination', 'Progressions', 'Geometry', 'Mensuration',
      'Algebra',
    ]),
  },
  {
    slug: 'logical',
    name: 'Logical Reasoning',
    short: 'Reasoning',
    icon: 'bi-diagram-3',
    color: '#7c5cff',
    description: 'Series, puzzles, arrangements and arguments: spot the pattern, then the answer.',
    topics: topics([
      'Number Series', 'Alphabet Series', 'Coding and Decoding', 'Blood Relations', 'Direction Sense',
      'Seating Arrangement', 'Puzzles', 'Syllogism', 'Statement and Conclusion', 'Statement and Assumption',
      'Analogy', 'Classification', 'Odd One Out', 'Ranking and Ordering', 'Calendar', 'Clock', 'Venn Diagrams',
      'Logical Sequence', 'Data Sufficiency', 'Non-Verbal Reasoning',
    ]),
  },
  {
    slug: 'verbal',
    name: 'Verbal Ability',
    short: 'Verbal',
    icon: 'bi-chat-quote',
    color: '#2875a8',
    description: 'Grammar, vocabulary and reading: the English section of every aptitude test.',
    topics: topics([
      'Reading Comprehension', 'Synonyms', 'Antonyms', 'Sentence Correction', 'Error Detection', 'Fill in the Blanks',
      'Para Jumbles', 'Sentence Completion', 'Active and Passive Voice', 'Direct and Indirect Speech',
      'Idioms and Phrases', 'One Word Substitution', 'Vocabulary', 'Grammar', 'Sentence Improvement',
    ]),
  },
  {
    slug: 'data-interpretation',
    name: 'Data Interpretation',
    short: 'DI',
    icon: 'bi-bar-chart-line',
    color: '#16a34a',
    description: 'Read tables and charts quickly and calculate from them accurately.',
    topics: topics([
      'Tables', 'Bar Graphs', 'Pie Charts', 'Line Graphs', 'Caselet-based Questions', 'Mixed Graphs', 'Data Comparison',
    ]),
  },
];

// Placement tracks: a mix of topics. The pattern of each company's test changes
// over time, so these only suggest what to practise; edit freely.
const PLACEMENT_TRACKS = [
  { slug: 'tcs-nqt', name: 'TCS NQT', categories: ['quantitative', 'logical', 'verbal'] },
  { slug: 'infosys', name: 'Infosys', categories: ['quantitative', 'logical', 'verbal'] },
  { slug: 'wipro', name: 'Wipro', categories: ['quantitative', 'logical', 'verbal'] },
  { slug: 'accenture', name: 'Accenture', categories: ['logical', 'verbal', 'quantitative'] },
  { slug: 'cognizant', name: 'Cognizant', categories: ['quantitative', 'logical', 'verbal'] },
  { slug: 'capgemini', name: 'Capgemini', categories: ['quantitative', 'logical', 'verbal'] },
  { slug: 'deloitte', name: 'Deloitte', categories: ['quantitative', 'logical', 'verbal', 'data-interpretation'] },
  { slug: 'general', name: 'General Campus Placement', categories: ['quantitative', 'logical', 'verbal', 'data-interpretation'] },
];

const DIFFICULTIES = ['very-easy', 'easy', 'medium', 'hard'];

const topicIndex = new Map();
CATEGORIES.forEach((c) => c.topics.forEach((t) => topicIndex.set(t.slug, { ...t, category: c.slug, categoryName: c.name })));

module.exports = { CATEGORIES, PLACEMENT_TRACKS, DIFFICULTIES, topicIndex };
