import mongoose from 'mongoose';
import { config } from '../config/constants';

// Serverless hosts have no long-running server: connect lazily and reuse the connection
// across warm invocations.
let connecting: Promise<typeof mongoose> | undefined;

export const connectDb = (): Promise<typeof mongoose> => {
  connecting ??= mongoose
    .connect(config.mongo.uri, { serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs })
    .catch((err: unknown) => {
      connecting = undefined;
      throw err;
    });
  return connecting;
};
