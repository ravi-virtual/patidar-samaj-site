import type { IncomingMessage, ServerResponse } from 'node:http';
import mongoose from 'mongoose';
import app from '../backend/src/app';
import { config } from '../backend/src/config/constants';

// Serverless entry: Vercel has no long-running server, so connect lazily and reuse the
// connection across warm invocations.
let connecting: Promise<typeof mongoose> | undefined;

const connect = (): Promise<typeof mongoose> => {
  connecting ??= mongoose
    .connect(config.mongo.uri, { serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs })
    .catch((err: unknown) => {
      connecting = undefined;
      throw err;
    });
  return connecting;
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await connect();
  app(req, res);
}
