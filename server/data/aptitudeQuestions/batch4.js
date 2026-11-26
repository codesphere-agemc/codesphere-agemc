// Aptitude question bank, batch 4: original questions for the topics the
// template set couldn't fill (partnership, mixtures, number series,
// syllogisms, statements, data sufficiency, arrangements and most of verbal).
// Same helper and rules as batches 1 and 2.

const q = (code, topic, difficulty, estimatedSeconds, statement, options, answer, explanation, extra = {}) => ({
  code, topic, difficulty, estimatedSeconds, statement, options, answer, explanation, ...extra,
});

const SYL = ['Only conclusion I follows', 'Only conclusion II follows', 'Both conclusions follow', 'Neither conclusion follows'];
const SC = SYL;
const SAS = ['Only assumption I is implicit', 'Only assumption II is implicit', 'Both are implicit', 'Neither is implicit'];
const DS = ['Statement 1 alone is sufficient', 'Statement 2 alone is sufficient', 'Both statements together are needed', 'Both together are not sufficient'];

const PASSAGE_SLEEP = 'Read the passage and answer the question.\n\nSleep is not simply rest for the body. During deep sleep, the brain replays the day\'s experiences and strengthens the connections that store new information. Students who sleep well after studying tend to remember more than those who stay up late revising. A short nap can help, but it cannot fully replace a full night of sleep. The practical lesson is simple: an extra hour of revision late at night may cost more than it gains.';
const PASSAGE_SOLAR = 'Read the passage and answer the question.\n\nIn many villages, small solar panels now power lights, phone chargers and water pumps. They cost little to run once installed, but the upfront price is still a hurdle for poor households. Some cooperatives solve this by letting families pay in small weekly instalments. Where this model is used, more homes have switched to solar power, and children can study after dark.';

const QUANT = [
  // ---------- Partnership ----------
  q('QA-PART-002', 'partnership', 'easy', 45, 'A invests ₹20,000 and B invests ₹30,000 in a business for a year. The profit is ₹15,000. What is B\'s share?', ['₹9,000', '₹6,000', '₹7,500', '₹10,000'], 0,
    'For the same period, profit is shared in the ratio of investments: 20,000 : 30,000 = 2 : 3.\nB\'s share = 15,000 × 3/5 = ₹9,000.',
    { hint: 'Same time, so split the profit in the ratio of the money invested.', verify: '15000 * 3 / 5' }),
  q('QA-PART-003', 'partnership', 'medium', 60, 'A invests ₹12,000 for 12 months and B invests ₹18,000 for 8 months. The profit is ₹9,000. What is A\'s share?', ['₹4,500', '₹3,600', '₹5,400', '₹3,000'], 0,
    'Share depends on money × time.\nA: 12,000 × 12 = 1,44,000. B: 18,000 × 8 = 1,44,000.\nThe ratio is 1 : 1, so A gets 9,000 ÷ 2 = ₹4,500.',
    { hint: 'Multiply each investment by its number of months.', verify: '9000 * (12000 * 12) / (12000 * 12 + 18000 * 8)' }),
  q('QA-PART-004', 'partnership', 'very-easy', 35, 'A, B and C invest in the ratio 2 : 3 : 5 for the same period. Out of a profit of ₹25,000, how much does C get?', ['₹12,500', '₹7,500', '₹10,000', '₹5,000'], 0,
    'Total parts = 2 + 3 + 5 = 10.\nC\'s share = 25,000 × 5/10 = ₹12,500.',
    { verify: '25000 * 5 / 10' }),
  q('QA-PART-005', 'partnership', 'medium', 75, 'A starts a business with ₹40,000. After 4 months, B joins with ₹50,000. At the end of the year the profit is ₹22,000. What is B\'s share?', ['₹10,000', '₹12,000', '₹11,000', '₹8,800'], 0,
    'A\'s capital-months = 40,000 × 12 = 4,80,000.\nB\'s = 50,000 × 8 = 4,00,000.\nRatio = 480 : 400 = 6 : 5. B gets 22,000 × 5/11 = ₹10,000.',
    { hint: 'B\'s money is in the business for only 8 months.', verify: '22000 * (50000 * 8) / (40000 * 12 + 50000 * 8)' }),
  q('QA-PART-006', 'partnership', 'hard', 90, 'A invests ₹50,000 and B invests ₹30,000 for a year. A also manages the business and first takes 10% of the profit for this. The rest is shared in the ratio of investments. If the total profit is ₹20,000, how much does A get in all?', ['₹13,250', '₹12,500', '₹11,250', '₹14,000'], 0,
    'Management fee = 10% of 20,000 = 2,000. Remaining profit = 18,000.\nInvestment ratio = 50 : 30 = 5 : 3, so A gets 18,000 × 5/8 = 11,250.\nA\'s total = 2,000 + 11,250 = ₹13,250.',
    { hint: 'Take out the 10% first, then split the rest.', verify: '2000 + 18000 * 5 / 8' }),
  q('QA-PART-007', 'partnership', 'easy', 45, 'A and B invest for the same period and share the profit in the ratio 3 : 4. If A invested ₹27,000, how much did B invest?', ['₹36,000', '₹32,000', '₹30,000', '₹20,250'], 0,
    'Same period, so investments are in the profit ratio 3 : 4.\nB = 27,000 × 4/3 = ₹36,000.',
    { verify: '27000 * 4 / 3' }),

  // ---------- Mixtures and alligation ----------
  q('QA-MIX-006', 'mixtures-and-alligation', 'easy', 45, 'Tea costing ₹120/kg is mixed with tea costing ₹150/kg in the ratio 2 : 1. What is the price of the mixture per kg?', ['₹130', '₹135', '₹125', '₹140'], 0,
    'Cost of 3 kg = 2 × 120 + 1 × 150 = 390.\nPrice per kg = 390 ÷ 3 = ₹130.',
    { verify: '(2 * 120 + 150) / 3' }),
  q('QA-MIX-007', 'mixtures-and-alligation', 'medium', 60, '30 litres of a 20% alcohol solution is mixed with 20 litres of a 45% alcohol solution. What is the alcohol percentage of the mixture?', ['30%', '32.5%', '28%', '35%'], 0,
    'Alcohol = 20% of 30 + 45% of 20 = 6 + 9 = 15 litres.\nTotal = 50 litres. 15 ÷ 50 × 100 = 30%.',
    { verify: '(0.2 * 30 + 0.45 * 20) / 50 * 100' }),
  q('QA-MIX-008', 'mixtures-and-alligation', 'medium', 60, 'Milk costs ₹30 per litre. How much water must be added to 40 litres of milk so that the mixture costs ₹24 per litre?', ['10 litres', '8 litres', '12 litres', '6 litres'], 0,
    'Water costs nothing. By alligation, milk : water = (24 − 0) : (30 − 24) = 24 : 6 = 4 : 1.\nWater = 40 ÷ 4 = 10 litres.',
    { hint: 'Treat water as costing ₹0.', verify: '40 / 4' }),
  q('QA-MIX-009', 'mixtures-and-alligation', 'hard', 90, 'A trader mixes rice costing ₹27/kg with rice costing ₹32/kg and sells the mixture at ₹33/kg, making a 10% profit. In what ratio did he mix the two kinds?', ['2 : 3', '3 : 2', '1 : 2', '3 : 4'], 0,
    'Selling at ₹33 with 10% profit means the mixture costs 33 ÷ 1.1 = ₹30/kg.\nAlligation: cheaper : dearer = (32 − 30) : (30 − 27) = 2 : 3.',
    { hint: 'Find the cost price of the mixture first.' }),
];

const LOGICAL = [
  // ---------- Number series ----------
  q('LR-NS-005', 'number-series', 'easy', 45, 'Find the next number: 0, 6, 24, 60, 120, ?', ['210', '180', '200', '216'], 0,
    'Each term is n³ − n: 1 − 1, 8 − 2, 27 − 3, 64 − 4, 125 − 5. The next is 216 − 6 = 210.',
    { hint: 'Compare each term with the cubes 1, 8, 27, 64, 125.', verify: '6 ** 3 - 6' }),
  q('LR-NS-006', 'number-series', 'medium', 50, 'Find the next number: 4, 10, 22, 46, 94, ?', ['190', '188', '142', '182'], 0,
    'Each term is double the previous one plus 2: 94 × 2 + 2 = 190.',
    { hint: 'Compare each term with twice the one before.', verify: '94 * 2 + 2' }),
  q('LR-NS-007', 'number-series', 'very-easy', 30, 'Find the next number: 1, 4, 9, 16, 25, ?', ['36', '35', '30', '49'], 0,
    'These are the squares 1², 2², 3², 4², 5², so the next is 6² = 36.',
    { verify: '6 ** 2' }),
  q('LR-NS-008', 'number-series', 'easy', 40, 'Find the next number: 1, 1, 2, 3, 5, 8, ?', ['13', '11', '12', '16'], 0,
    'Each term is the sum of the two before it: 5 + 8 = 13.',
    { verify: '5 + 8' }),
  q('LR-NS-009', 'number-series', 'medium', 60, 'Find the next number: 120, 99, 80, 63, 48, ?', ['35', '36', '33', '38'], 0,
    'The differences are −21, −19, −17, −15, so the next is −13: 48 − 13 = 35.\n(The terms are 11² − 1, 10² − 1, …, 6² − 1 = 35.)',
    { verify: '48 - 13' }),
  q('LR-NS-010', 'number-series', 'hard', 60, 'Find the next number: 2, 3, 5, 9, 17, ?', ['33', '31', '34', '25'], 0,
    'The differences double each time: +1, +2, +4, +8, so the next is +16: 17 + 16 = 33.',
    { verify: '17 + 16' }),
  q('LR-NS-011', 'number-series', 'medium', 60, 'Which number is wrong in the series 2, 5, 10, 17, 26, 38, 50?', ['38', '26', '17', '50'], 0,
    'The pattern is n² + 1: 2, 5, 10, 17, 26, 37, 50.\nThe sixth term should be 37, not 38.',
    { hint: 'Subtract 1 from each term.' }),

  // ---------- Syllogism ----------
  q('LR-SYL-004', 'syllogism', 'easy', 50, 'Statements: All cats are animals. All animals are living beings.\nConclusions: I. All cats are living beings. II. Some living beings are cats.', SYL, 2,
    'All cats are animals and all animals are living beings, so all cats are living beings: I follows.\nIf all cats are living beings, then some living beings are cats: II follows too.',
    { hint: 'Draw circles: cats inside animals inside living beings.' }),
  q('LR-SYL-005', 'syllogism', 'medium', 60, 'Statements: Some books are pens. No pen is a pencil.\nConclusions: I. Some books are not pencils. II. No book is a pencil.', SYL, 0,
    'The books that are pens can\'t be pencils, so some books are not pencils: I follows.\nOther books might still be pencils, so II does not follow.',
    { hint: 'Focus on the books that are also pens.' }),
  q('LR-SYL-006', 'syllogism', 'medium', 60, 'Statements: All doctors are graduates. Some graduates are singers.\nConclusions: I. Some doctors are singers. II. Some singers are graduates.', SYL, 1,
    'The graduates who sing may not be doctors, so I does not follow.\n"Some graduates are singers" means some singers are graduates: II follows.',
    { hint: 'A "some" statement can be reversed; an "all" statement can\'t.' }),
  q('LR-SYL-007', 'syllogism', 'medium', 60, 'Statements: No fish is a bird. All birds are animals.\nConclusions: I. Some animals are not fish. II. No fish is an animal.', SYL, 0,
    'All birds are animals and no bird is a fish, so the animals that are birds are not fish: I follows.\nFish could still be animals (outside the birds), so II does not follow.' ),
  q('LR-SYL-008', 'syllogism', 'hard', 75, 'Statements: Some cars are red. Some red things are toys.\nConclusions: I. Some cars are toys. II. All toys are cars.', SYL, 3,
    'Two "some" statements give no definite link between cars and toys: the red cars and the red toys may be different things. So I does not follow.\nNothing says every toy is a car, so II does not follow either.',
    { hint: 'Two "some" statements can\'t be chained together.' }),

  // ---------- Statement and conclusion ----------
  q('LR-SC-003', 'statement-and-conclusion', 'easy', 50, 'Statement: The library will be closed this Sunday for maintenance.\nConclusions: I. The library needs maintenance work. II. The library is never open on Sundays.', SC, 0,
    'Closing for maintenance means maintenance work is needed: I follows.\n"Closed this Sunday" suggests it is normally open on Sundays, so II does not follow.'),
  q('LR-SC-004', 'statement-and-conclusion', 'easy', 50, 'Statement: Only students with at least 75% attendance may sit the exam. Riya sat the exam.\nConclusions: I. Riya has at least 75% attendance. II. Riya passed the exam.', SC, 0,
    'Sitting the exam needs 75% attendance, so I follows.\nNothing is said about the result, so II does not follow.'),
  q('LR-SC-005', 'statement-and-conclusion', 'easy', 45, 'Statement: Vegetable prices rose sharply after heavy rain damaged crops.\nConclusions: I. Heavy rain can affect the supply of vegetables. II. Vegetable prices never fall.', SC, 0,
    'Damaged crops mean less supply, so I follows.\nThe statement says nothing about prices falling later, so II does not follow.'),
  q('LR-SC-006', 'statement-and-conclusion', 'medium', 60, 'Statement: All employees must wear their ID cards inside the office.\nConclusions: I. An employee inside the office without an ID card is breaking the rule. II. Visitors do not need ID cards.', SC, 0,
    'The rule applies to every employee inside the office, so I follows.\nThe statement says nothing about visitors, so II does not follow.'),
  q('LR-SC-007', 'statement-and-conclusion', 'medium', 60, 'Statement: The company\'s sales doubled after it launched online ordering.\nConclusions: I. Online ordering was the only reason sales rose. II. Sales after the launch were higher than before.', SC, 1,
    'Other factors may also have helped, so I does not follow.\nSales doubled, so they were certainly higher: II follows.'),

  // ---------- Statement and assumption ----------
  q('LR-SAS-003', 'statement-and-assumption', 'easy', 50, 'Statement: A notice reads, "Please switch off the lights when you leave the room."\nAssumptions: I. People sometimes leave the lights on. II. Whoever put up the notice wants to save electricity.', SAS, 2,
    'The notice would be pointless if nobody left lights on: I is implicit.\nAsking people to switch lights off assumes saving electricity matters: II is implicit too.'),
  q('LR-SAS-004', 'statement-and-assumption', 'easy', 50, 'Statement: "Apply before 30 June to get the early-bird discount."\nAssumptions: I. Some people will want the discount. II. Nobody applies after 30 June.', SAS, 0,
    'Offering a discount assumes it will attract some applicants: I is implicit.\nThe offer doesn\'t assume nobody applies later; later applicants simply pay more. II is not implicit.'),
  q('LR-SAS-005', 'statement-and-assumption', 'medium', 50, 'Statement: A sign says, "In case of fire, use the stairs. Do not use the lift."\nAssumptions: I. Lifts may be unsafe during a fire. II. The building has stairs people can use.', SAS, 2,
    'Warning against the lift assumes it may be unsafe: I is implicit.\nTelling people to use the stairs assumes there are stairs: II is implicit.'),
  q('LR-SAS-006', 'statement-and-assumption', 'medium', 55, 'Statement: An advert says, "Our new phone has the longest battery life in its price range."\nAssumptions: I. Buyers care about battery life. II. Other phones in that range have no battery.', SAS, 0,
    'The advert highlights battery life because buyers are expected to care: I is implicit.\n"Longest" compares with other phones that do have batteries, so II is not implicit.'),

  // ---------- Data sufficiency ----------
  q('LR-DSF-003', 'data-sufficiency', 'medium', 60, 'What is the value of x?\n(1) x² = 49\n(2) x > 0', DS, 2,
    'Statement 1 gives x = 7 or x = −7, so it isn\'t enough alone. Statement 2 alone gives no value.\nTogether: x = 7. Both are needed.'),
  q('LR-DSF-004', 'data-sufficiency', 'easy', 45, 'What is the value of a?\n(1) 3a + 2 = 17\n(2) a + b = 10', DS, 0,
    'Statement 1 gives 3a = 15, so a = 5: sufficient alone.\nStatement 2 has two unknowns, so it isn\'t enough on its own.'),
  q('LR-DSF-005', 'data-sufficiency', 'medium', 60, 'On which day is the meeting?\n(1) It is not on Monday.\n(2) It is on the day after Tuesday.', DS, 1,
    'Statement 1 leaves six possible days.\nStatement 2 alone fixes the day: Wednesday.'),
  q('LR-DSF-006', 'data-sufficiency', 'medium', 60, 'What is Priya\'s rank in a class of 40?\n(1) Priya is ranked above Kiran.\n(2) Kiran is ranked 10th.', DS, 3,
    'Together we only know Priya is somewhere from 1st to 9th. Her exact rank still can\'t be found.'),

  // ---------- Seating arrangement ----------
  q('LR-SA-005', 'seating-arrangement', 'medium', 75, 'Six people A, B, C, D, E and F sit in a row facing north. F is at the left end. C is third from the left. E sits immediately left of C and A immediately right of C. B is not at the right end. Who is at the right end?', ['D', 'B', 'A', 'E'], 0,
    'From the left: F (1st), E (2nd), C (3rd), A (4th).\nB and D take the 5th and 6th seats. B isn\'t at the right end, so B is 5th and D is 6th.',
    { hint: 'Place F, C, E and A first.' }),
  q('LR-SA-006', 'seating-arrangement', 'medium', 75, 'P, Q, R, S and T sit in a row facing north. Q is in the middle. P is second to the right of Q. T is immediately left of Q. R does not sit next to T. Who is at the left end?', ['S', 'R', 'T', 'P'], 0,
    'Seats 1–5 from the left: Q is 3rd, P is 5th, T is 2nd.\nR and S take seats 1 and 4. Seat 1 is next to T, so R is 4th and S is 1st.'),
  q('LR-SA-007', 'seating-arrangement', 'easy', 50, 'A, B, C and D sit around a square table, one on each side, facing the centre. A sits opposite C. B sits to the left of A. Who sits to the right of A?', ['D', 'B', 'C', 'Nobody'], 0,
    'C is opposite A, and B is on A\'s left. The only seat left, on A\'s right, belongs to D.'),

  // ---------- Blood relations ----------
  q('LR-BR-009', 'blood-relations', 'medium', 60, 'X is the son of Y. Y is the only daughter of Z. How is X related to Z\'s husband?', ['Grandson', 'Son', 'Nephew', 'Son-in-law'], 0,
    'Y is the daughter of Z and Z\'s husband, and X is Y\'s son.\nSo X is the grandson of Z\'s husband.'),
  q('LR-BR-010', 'blood-relations', 'easy', 50, 'A is the brother of B. B is the sister of C. C is the father of D. How is A related to D?', ['Uncle', 'Father', 'Brother', 'Grandfather'], 0,
    'A and B are siblings of C. C is D\'s father, so A is the brother of D\'s father: D\'s uncle.'),
  q('LR-BR-011', 'blood-relations', 'hard', 75, 'Ravi says, "This woman is the wife of my mother\'s only grandson." Ravi has no brothers or sisters and has one son. How is Ravi related to the woman?', ['Father-in-law', 'Father', 'Brother-in-law', 'Uncle'], 0,
    'Ravi is his mother\'s only child, so her only grandson is Ravi\'s son.\nThe woman is Ravi\'s son\'s wife, so Ravi is her father-in-law.',
    { hint: 'Who can Ravi\'s mother\'s grandson be, if Ravi is her only child?' }),

  // ---------- Classification ----------
  q('LR-CL-002', 'classification', 'very-easy', 30, 'Which one does not belong with the others: Mercury, Venus, Moon, Mars?', ['Moon', 'Mercury', 'Venus', 'Mars'], 0,
    'Mercury, Venus and Mars are planets. The Moon is a natural satellite of the Earth.'),
  q('LR-CL-003', 'classification', 'easy', 40, 'Which number does not belong with the others: 27, 64, 125, 144?', ['144', '27', '64', '125'], 0,
    '27 = 3³, 64 = 4³ and 125 = 5³ are perfect cubes. 144 = 12² is a square, not a cube.'),
  q('LR-CL-004', 'classification', 'easy', 40, 'Which one does not belong with the others: Violin, Guitar, Flute, Sitar?', ['Flute', 'Violin', 'Guitar', 'Sitar'], 0,
    'The violin, guitar and sitar are string instruments. The flute is a wind instrument.'),
  q('LR-CL-005', 'classification', 'medium', 45, 'Which city does not belong with the others: Kolkata, Chennai, Mumbai, Bengaluru?', ['Bengaluru', 'Kolkata', 'Chennai', 'Mumbai'], 0,
    'Kolkata, Chennai and Mumbai are port cities on or near the coast. Bengaluru is inland.'),

  // ---------- Logical sequence ----------
  q('LR-LS-002', 'logical-sequence', 'very-easy', 35, 'Arrange in a logical order: 1. Seed 2. Plant 3. Fruit 4. Flower', ['1, 2, 4, 3', '1, 4, 2, 3', '2, 1, 4, 3', '1, 2, 3, 4'], 0,
    'A seed grows into a plant, the plant flowers, and the flower becomes a fruit: 1, 2, 4, 3.'),
  q('LR-LS-003', 'logical-sequence', 'easy', 35, 'Arrange in a logical order: 1. Teenager 2. Infant 3. Adult 4. Child', ['2, 4, 1, 3', '4, 2, 1, 3', '2, 1, 4, 3', '2, 4, 3, 1'], 0,
    'Infant → child → teenager → adult: 2, 4, 1, 3.'),
  q('LR-LS-004', 'logical-sequence', 'medium', 50, 'Arranged in dictionary order, which word comes third: Ancient, Anchor, Angle, Ankle, Analyse?', ['Ancient', 'Anchor', 'Angle', 'Analyse'], 0,
    'Dictionary order: Analyse, Anchor, Ancient, Angle, Ankle. The third word is Ancient.',
    { hint: 'All start with "An"; compare the third and fourth letters.' }),
  q('LR-LS-005', 'logical-sequence', 'medium', 50, 'Arrange in a logical order: 1. Interview 2. Apply 3. Joining 4. Selection 5. Advertisement', ['5, 2, 1, 4, 3', '2, 5, 1, 4, 3', '5, 2, 4, 1, 3', '5, 1, 2, 4, 3'], 0,
    'A job is advertised, people apply, they are interviewed, some are selected and then they join: 5, 2, 1, 4, 3.'),
];

const VERBAL = [
  // ---------- Reading comprehension ----------
  q('VA-RC-004', 'reading-comprehension', 'easy', 90, `${PASSAGE_SLEEP}\n\nWhat is the main idea of the passage?`, ['Good sleep helps the brain store what we learn', 'Naps are better than night-time sleep', 'Students should revise late at night', 'Sleep only rests the body'], 0,
    'The passage explains how sleep strengthens memory and warns against swapping sleep for late revision.'),
  q('VA-RC-005', 'reading-comprehension', 'easy', 75, `${PASSAGE_SLEEP}\n\nAccording to the passage, what happens during deep sleep?`, ['The brain strengthens connections that store new information', 'The body stops using energy', 'The brain forgets unimportant facts', 'Dreams replace memories'], 0,
    'The second sentence says the brain "strengthens the connections that store new information" during deep sleep.'),
  q('VA-RC-006', 'reading-comprehension', 'medium', 90, `${PASSAGE_SLEEP}\n\nWhat would the writer most likely advise a student the night before an exam?`, ['Finish revising earlier and get a full night\'s sleep', 'Stay up late to revise everything', 'Take several short naps instead of sleeping', 'Skip revision completely'], 0,
    'The passage ends by saying late-night revision may cost more than it gains, and that naps can\'t replace a full night of sleep.'),
  q('VA-RC-007', 'reading-comprehension', 'easy', 75, `${PASSAGE_SOLAR}\n\nWhat stops poor households from using solar panels?`, ['The upfront price', 'The cost of running them', 'A lack of sunlight', 'Government rules'], 0,
    'The passage says the panels "cost little to run" but "the upfront price is still a hurdle".'),
  q('VA-RC-008', 'reading-comprehension', 'easy', 75, `${PASSAGE_SOLAR}\n\nHow do some cooperatives help families?`, ['They let families pay in small weekly instalments', 'They give the panels away free', 'They lower electricity bills', 'They train children to install panels'], 0,
    'The third sentence says cooperatives let families "pay in small weekly instalments".'),
  q('VA-RC-009', 'reading-comprehension', 'medium', 60, `${PASSAGE_SOLAR}\n\nAs used in the passage, "hurdle" most nearly means:`, ['obstacle', 'race', 'advantage', 'payment'], 0,
    'The upfront price is something that blocks or holds back poor households, so "hurdle" means an obstacle.'),

  // ---------- Sentence correction ----------
  q('VA-SC-003', 'sentence-correction', 'easy', 40, 'Choose the correct sentence about a friend who lives in Pune.', ['One of my friends lives in Pune.', 'One of my friends live in Pune.', 'One of my friend lives in Pune.', 'One of my friend live in Pune.'], 0,
    '"One of" is followed by a plural noun (friends), and the verb agrees with "one", so it is singular (lives).'),
  q('VA-SC-004', 'sentence-correction', 'medium', 45, 'Choose the correct sentence about working somewhere since 2019.', ['I have been working here since 2019.', 'I am working here since 2019.', 'I have been working here from 2019.', 'I worked here since 2019.'], 0,
    'An action that started in the past and still continues takes the present perfect continuous, and a starting point takes "since".'),
  q('VA-SC-005', 'sentence-correction', 'medium', 45, 'Choose the correct sentence about who was informed.', ['Neither the manager nor the employees were informed.', 'Neither the manager nor the employees was informed.', 'Neither the manager or the employees were informed.', 'Neither the manager nor the employees is informed.'], 0,
    'With "neither … nor", the verb agrees with the nearer subject. "Employees" is plural, so "were" is correct. "Neither" pairs with "nor", not "or".'),
  q('VA-SC-006', 'sentence-correction', 'hard', 50, 'Choose the correct sentence about the rain starting.', ['Hardly had he arrived when it started to rain.', 'Hardly he had arrived when it started to rain.', 'Hardly had he arrived than it started to rain.', 'Hardly did he arrived when it started to rain.'], 0,
    '"Hardly" at the start of a sentence needs inverted word order (had he arrived) and is followed by "when", not "than".'),
  q('VA-SC-007', 'sentence-correction', 'medium', 45, 'Choose the correct sentence about the number of students.', ['The number of students has increased.', 'The number of students have increased.', 'The number of students are increased.', 'The number of student has increased.'], 0,
    '"The number of" refers to a single number, so it takes a singular verb (has). Compare "A number of students have…", which means "many students".'),

  // ---------- Error detection ----------
  q('VA-ED-004', 'error-detection', 'easy', 40, 'Find the part with an error: "Each of the boys (1) / have brought (2) / his own lunch. (3) / No error"', ['Part 2', 'Part 1', 'Part 3', 'No error'], 0,
    '"Each" is singular, so the verb should be "has brought", not "have brought". The error is in part 2.'),
  q('VA-ED-005', 'error-detection', 'medium', 45, 'Find the part with an error: "She insisted (1) / on to pay (2) / the bill herself. (3) / No error"', ['Part 2', 'Part 1', 'Part 3', 'No error'], 0,
    '"Insist on" is followed by an -ing form: "insisted on paying". Part 2 is wrong.'),
  q('VA-ED-006', 'error-detection', 'easy', 40, 'Find the part with an error: "The furniture (1) / in this room (2) / are very old. (3) / No error"', ['Part 3', 'Part 1', 'Part 2', 'No error'], 0,
    '"Furniture" is uncountable and takes a singular verb: "is very old". Part 3 is wrong.'),
  q('VA-ED-007', 'error-detection', 'medium', 45, 'Find the part with an error: "I look forward (1) / to meeting you (2) / next week. (3) / No error"', ['No error', 'Part 1', 'Part 2', 'Part 3'], 0,
    '"Look forward to" is followed by an -ing form, so "to meeting you" is correct. There is no error.'),

  // ---------- Para jumbles ----------
  q('VA-PJ-003', 'para-jumbles', 'easy', 60, 'Arrange the sentences in the correct order.\nP: She then mixed the flour with water.\nQ: First, Meera bought flour from the market.\nR: Finally, the bread came out of the oven golden and soft.\nS: After the dough rose, she shaped it and baked it.', ['QPSR', 'PQSR', 'QSPR', 'QPRS'], 0,
    '"First" opens (Q), "then" follows (P), the dough rising and baking comes next (S), and "Finally" ends it (R).'),
  q('VA-PJ-004', 'para-jumbles', 'medium', 75, 'Arrange the sentences in the correct order.\nP: As a result, the town\'s air became noticeably cleaner.\nQ: The council banned old diesel buses in 2022.\nR: It replaced them with electric buses within a year.\nS: Residents with asthma reported fewer attacks.',  ['QRPS', 'QPRS', 'RQPS', 'QRSP'], 0,
    'The ban (Q) comes first, "them" in R refers to the buses, "As a result" (P) gives the effect, and S is a further result of cleaner air.'),
  q('VA-PJ-005', 'para-jumbles', 'easy', 60, 'Arrange the sentences in the correct order.\nP: However, he did not give up.\nQ: Arjun failed his driving test the first time.\nR: He practised every evening for a month.\nS: On his second attempt, he passed easily.', ['QPRS', 'QRPS', 'PQRS', 'QPSR'], 0,
    'The failure (Q) comes first, "However" (P) contrasts with it, the practice (R) follows, and the pass (S) ends the story.'),
  q('VA-PJ-006', 'para-jumbles', 'medium', 75, 'Arrange the sentences in the correct order.\nP: These signals travel along nerves to the brain.\nQ: When you touch something hot, sensors in your skin send signals.\nR: The brain then tells the muscles in your hand to pull away.\nS: All of this happens in a fraction of a second.', ['QPRS', 'PQRS', 'QRPS', 'QPSR'], 0,
    'Q starts the process, "These signals" (P) refers back to Q, "then" (R) continues it, and S sums up the whole sequence.'),

  // ---------- Sentence completion ----------
  q('VA-SCO-003', 'sentence-completion', 'very-easy', 30, 'The road was so slippery that ____.', ['we had to drive very slowly', 'we drove very fast', 'it was completely dry', 'because it had rained'], 0,
    '"So … that" introduces a result. A slippery road leads to driving slowly.'),
  q('VA-SCO-004', 'sentence-completion', 'easy', 35, 'Unless you leave now, ____.', ['you will miss the train', 'you would have missed the train', 'you missed the train', 'you are missing the train yesterday'], 0,
    '"Unless" with a present-tense clause takes a future result in the main clause: "you will miss".'),
  q('VA-SCO-005', 'sentence-completion', 'medium', 40, 'No sooner had the bell rung ____.', ['than the students rushed out', 'when the students rushed out', 'then the students rushed out', 'that the students rushed out'], 0,
    '"No sooner" is always paired with "than".'),
  q('VA-SCO-006', 'sentence-completion', 'medium', 40, 'She was very tired; ____, she finished the report before leaving.', ['nevertheless', 'therefore', 'because', 'so that'], 0,
    'Finishing the report despite being tired is a contrast, so "nevertheless" fits.'),

  // ---------- Direct and indirect speech ----------
  q('VA-DI-003', 'direct-and-indirect-speech', 'easy', 45, 'Choose the correct indirect form: He said, "I will call you tomorrow."', ['He said that he would call me the next day.', 'He said that he will call me tomorrow.', 'He said that I would call you the next day.', 'He says that he would call me tomorrow.'], 0,
    '"I" becomes "he", "you" becomes "me", "will" back-shifts to "would", and "tomorrow" becomes "the next day".'),
  q('VA-DI-004', 'direct-and-indirect-speech', 'easy', 45, 'Choose the correct indirect form: She asked me, "Where do you live?"', ['She asked me where I lived.', 'She asked me where do I live.', 'She asked me where did I live.', 'She asked me where you lived.'], 0,
    'A reported question uses statement word order (I lived), the tense back-shifts, and "you" becomes "I".'),
  q('VA-DI-005', 'direct-and-indirect-speech', 'medium', 45, 'Choose the correct indirect form: The teacher said, "The earth goes round the sun."', ['The teacher said that the earth goes round the sun.', 'The teacher said that the earth went round the sun.', 'The teacher said that the earth had gone round the sun.', 'The teacher says the earth went round the sun.'], 0,
    'A universal truth keeps its present tense in reported speech.'),
  q('VA-DI-006', 'direct-and-indirect-speech', 'medium', 45, 'Choose the correct indirect form: He said to me, "Please help me."', ['He requested me to help him.', 'He said me to help him.', 'He requested me to help me.', 'He told to me please help him.'], 0,
    'A polite request is reported with "requested … to", and "me" (the speaker) becomes "him".'),

  // ---------- Grammar ----------
  q('VA-GR-003', 'grammar', 'easy', 30, 'Choose the correct word: There ____ a lot of traffic today.', ['is', 'are', 'were', 'have'], 0,
    '"Traffic" is uncountable, so it takes a singular verb: "There is a lot of traffic."'),
  q('VA-GR-004', 'grammar', 'easy', 30, 'Choose the correct word: I prefer tea ____ coffee.', ['to', 'than', 'over', 'from'], 0,
    '"Prefer" is followed by "to" when comparing two things: "prefer tea to coffee".'),
  q('VA-GR-005', 'grammar', 'easy', 30, 'Choose the correct word: He has been absent ____ Monday.', ['since', 'for', 'from', 'by'], 0,
    'A starting point in time (Monday) with the present perfect takes "since".'),
  q('VA-GR-006', 'grammar', 'hard', 45, 'Choose the correct word: She is one of the best players who ____ ever played for the club.', ['have', 'has', 'is', 'was'], 0,
    '"Who" refers to "the best players" (plural), so the verb is plural: "who have ever played".'),
  q('VA-GR-007', 'grammar', 'very-easy', 25, 'Choose the correct word: Mathematics ____ my favourite subject.', ['is', 'are', 'were', 'have been'], 0,
    'Subjects ending in -ics, such as mathematics and physics, are singular: "Mathematics is".'),

  // ---------- Sentence improvement ----------
  q('VA-SI-003', 'sentence-improvement', 'easy', 35, 'Improve the part in quotes: He is "more stronger" than his brother.', ['stronger', 'most strong', 'more strong', 'No improvement needed'], 0,
    '"Stronger" is already a comparative; adding "more" is a double comparative.'),
  q('VA-SI-004', 'sentence-improvement', 'medium', 40, 'Improve the part in quotes: I "am knowing" him for many years.', ['have known', 'knew', 'am known', 'No improvement needed'], 0,
    '"Know" is a state verb and isn\'t used in the continuous form. A state that began in the past and continues takes the present perfect: "have known".'),
  q('VA-SI-005', 'sentence-improvement', 'easy', 35, 'Improve the part in quotes: She "returned back" home late.', ['returned', 'returned again', 'came back returned', 'No improvement needed'], 0,
    '"Return" already means "come back", so "returned back" repeats itself.'),
  q('VA-SI-006', 'sentence-improvement', 'medium', 40, 'Improve the part in quotes: We "discussed about the plan" at length.', ['discussed the plan', 'discussed on the plan', 'discussed over the plan', 'No improvement needed'], 0,
    '"Discuss" takes a direct object; it isn\'t followed by "about".'),
];

const CATEGORY_OF = (list, category) => list.map((x) => ({ ...x, category }));

module.exports = [
  ...CATEGORY_OF(QUANT, 'quantitative'),
  ...CATEGORY_OF(LOGICAL, 'logical'),
  ...CATEGORY_OF(VERBAL, 'verbal'),
];
