// Verifies MongoDB connectivity using the same config as the API.
// Usage: npm run db:check   (from the repo root or backend/)
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/constants';

const describeTarget = (uri: string): string => {
  // Never print credentials: show host and database only.
  try {
    const u = new URL(uri);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(unparseable MONGO_URI)';
  }
};

const run = async (): Promise<void> => {
  console.log(`Checking MongoDB at ${describeTarget(config.mongo.uri)} ...`);
  try {
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs,
    });
    const admin = mongoose.connection.db?.admin();
    const info = await admin?.serverInfo();
    const ping = await admin?.ping();
    console.log(`OK  connected, server v${info?.version ?? 'unknown'}, ping ${JSON.stringify(ping)}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('FAIL could not reach MongoDB:', err instanceof Error ? err.message : err);
    console.error('Start mongod (see docs/setup) and confirm MONGO_URI in backend/.env.');
    process.exit(1);
  }
};

void run();
