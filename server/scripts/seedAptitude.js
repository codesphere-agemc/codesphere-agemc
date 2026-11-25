// Load the aptitude question bank into MongoDB. Safe to re-run: questions are
// matched by code and updated in place; an admin's draft/archived status is kept.
// Usage (from server/): node scripts/seedAptitude.js
require('dotenv').config();
const mongoose = require('mongoose');
const { prepared } = require('../data/aptitudeQuestions');
const { AptitudeQuestion } = require('../models/Aptitude');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const questions = prepared();
    const ops = questions.map(({ verify, ...q }) => ({
      updateOne: {
        filter: { code: q.code },
        update: { $set: { ...q, source: 'codesphere' }, $setOnInsert: { status: 'published' } },
        upsert: true,
      },
    }));
    const result = await AptitudeQuestion.bulkWrite(ops, { ordered: false });
    console.log(`Aptitude questions: ${result.upsertedCount} added, ${result.modifiedCount} updated, ${questions.length} in the bank.`);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
