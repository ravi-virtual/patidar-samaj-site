import 'dotenv/config';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import app from './src/app';
import { config } from './src/config/constants';

let server: Server | undefined;
let shuttingDown = false;

const shutdown = async (_signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  // Force-exit if connections refuse to drain.
  const forceTimer = setTimeout(() => {
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await mongoose.disconnect();
    process.exit(exitCode);
  } catch (err) {
    console.error('Error during shutdown', err);
    process.exit(1);
  }
};

const start = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs,
    });
  } catch (err) {
    console.error('Could not connect to MongoDB. Is mongod running and MONGO_URI correct?', err);
    process.exit(1);
  }
  server = app.listen(config.port);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is already in use. Stop the other process or change PORT in backend/.env.`,
      );
    } else {
      console.error('Server error', err);
    }
    void shutdown('server-error', 1);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  void shutdown('uncaughtException', 1);
});

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
