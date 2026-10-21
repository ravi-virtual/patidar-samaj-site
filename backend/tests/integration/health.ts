// Integration test: needs a running MongoDB (npm run mongo:start).
// Uses a dedicated database so it can never touch development data.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { config } from '../../src/config/constants';

describe('integration: database and health', () => {
  beforeAll(async () => {
    if (!/_test$/.test(new URL(config.mongo.uri).pathname)) {
      throw new Error('Refusing to run integration tests against a non-test database');
    }
    await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('connects to MongoDB and answers a ping', async () => {
    const ping = await mongoose.connection.db?.admin().ping();
    expect(ping?.ok).toBe(1);
  });

  it('reports healthy with the standard success shape', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Service healthy',
      data: { database: 'connected' },
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });

  it('does not leak configuration in the health response', async () => {
    const res = await request(app).get('/api/health');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(config.mongo.uri);
    expect(body).not.toContain(config.session.secret);
  });
});
