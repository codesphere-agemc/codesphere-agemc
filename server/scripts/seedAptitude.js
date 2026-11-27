// Load the aptitude question bank into MongoDB. Safe to re-run: questions are
// matched by code and updated in place; an admin's draft/archived status is kept.
// Usage (from server/): node scripts/seedAptitude.js
require('dotenv').config();
const mongoose = require('mongoose');
const { prepared } = require('../data/aptitudeQuestions');
const { AptitudeQuestion, AptitudeTest } = require('../models/Aptitude');
const sampleTests = require('../data/aptitudeTests');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Questions an editor changed in the admin panel are left alone.
    const edited = new Set(await AptitudeQuestion.distinct('code', { source: { $ne: 'codesphere' } }));
    const questions = prepared().filter((q) => !edited.has(q.code));
    const ops = questions.map(({ verify, ...q }) => ({
      updateOne: {
        filter: { code: q.code },
        update: { $set: { ...q, source: 'codesphere' }, $setOnInsert: { status: 'published' } },
        upsert: true,
      },
    }));
    const result = await AptitudeQuestion.bulkWrite(ops, { ordered: false });
    console.log(`Aptitude questions: ${result.upsertedCount} added, ${result.modifiedCount} updated, ${questions.length} in the bank${edited.size ? `, ${edited.size} edited by admins left as they are` : ''}.`);

    // Sample mock tests: content is refreshed, an admin's status choice is kept.
    const tests = await AptitudeTest.bulkWrite(sampleTests.map(({ slug, ...t }) => ({
      updateOne: { filter: { slug }, update: { $set: t, $setOnInsert: { slug, status: 'published' } }, upsert: true },
    })), { ordered: false });
    console.log(`Mock tests: ${tests.upsertedCount} added, ${tests.modifiedCount} updated.`);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
