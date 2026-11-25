import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('No MONGODB_URI found in environment.');
  process.exit(1);
}

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const collection = mongoose.connection.collection('users');
    const result = await collection.updateMany(
      {},
      {
        $unset: {
          technicalInterests: 1,
          learningGoals: 1,
        },
      }
    );

    console.log(`Matched ${result.matchedCount} users, modified ${result.modifiedCount} users.`);
    console.log('Fields technicalInterests and learningGoals have been removed from all user documents.');
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
