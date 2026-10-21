import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { ApiResponse } from '../../src/utils/apiResponse';
import { ResponseCodes } from '../../src/config/constants';

describe('foundation: HTTP layer', () => {
  it('returns the standard 404 error shape for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', details: [] },
    });
  });

  it('reports 503 from /api/health when the database is not connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('rejects malformed JSON with 400 and no stack trace', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });

  it('rejects bodies over the 10kb limit with 413', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and does not advertise Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('only allows the configured CORS origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('foundation: ApiResponse', () => {
  it('marks 2xx as success and 4xx as failure', () => {
    expect(new ApiResponse(ResponseCodes.OK, 'ok').success).toBe(true);
    expect(new ApiResponse(ResponseCodes.NOT_FOUND, 'nope').success).toBe(false);
  });
});
