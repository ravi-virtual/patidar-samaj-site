import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../backend/src/app';
import { connectDb } from '../backend/src/utils/dbConnect';

// Serverless entry for Vercel: /api/* is rewritten here (see vercel.json).
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await connectDb();
  app(req, res);
}
