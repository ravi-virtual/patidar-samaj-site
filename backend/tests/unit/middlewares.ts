import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import errorHandler from '../../src/middlewares/errorHandler';
import hasPermission, { hasAnyPermission } from '../../src/middlewares/hasPermission';
import isAuthenticated from '../../src/middlewares/isAuthenticated';
import isStaff from '../../src/middlewares/isStaff';
import isSuperAdmin from '../../src/middlewares/isSuperAdmin';
import { originGuard } from '../../src/middlewares/originGuard';
import { ALL_PERMISSIONS, Permissions } from '../../src/config/permissions';
import { Roles, config } from '../../src/config/constants';

interface Captured {
  status?: number;
  body?: { success: boolean; message: string; error: { code: string; details: { field?: string; message: string }[] } };
}

const makeRes = () => {
  const out: Captured = {};
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: Captured['body']) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
};

const makeReq = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  ({
    method: 'POST',
    path: '/x',
    cookies: {},
    get: (name: string) => headers[name.toLowerCase()],
    ...over,
  }) as unknown as Request;

const ORIGIN = config.clientOrigin;

describe('errorHandler', () => {
  const run = (err: Record<string, unknown>) => {
    const { res, out } = makeRes();
    const next = vi.fn();
    errorHandler(Object.assign(new Error((err.message as string) ?? 'boom'), err), makeReq(), res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
    return out;
  };

  // Server errors are logged; keep test output quiet whatever the logger writes to.
  beforeEach(() => {
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers an unknown error with a generic 500 and no internals', () => {
    const out = run({ message: 'connect ECONNREFUSED 10.0.0.5:27017 password=hunter2' });
    expect(out.status).toBe(500);
    expect(out.body).toEqual({ success: false, message: 'Something went wrong', error: { code: 'SERVER_ERROR', details: [] } });
    expect(JSON.stringify(out.body)).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/);
  });

  it('maps an oversized upload to 413 and other multer errors to 400', () => {
    const big = run({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
    expect([big.status, big.body?.error.code]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    const other = run({ name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' });
    expect([other.status, other.body?.error.code]).toEqual([400, 'VALIDATION_ERROR']);
  });

  it('maps body-parser size and parse errors', () => {
    expect(run({ type: 'entity.too.large', status: 413 }).body?.error.code).toBe('PAYLOAD_TOO_LARGE');
    const parse = run({ type: 'entity.parse.failed', status: 400 });
    expect([parse.status, parse.body?.message]).toEqual([400, 'Malformed request body']);
  });

  it('treats any SyntaxError as a malformed body', () => {
    const { res, out } = makeRes();
    errorHandler(new SyntaxError('Unexpected token'), makeReq(), res, vi.fn() as unknown as NextFunction);
    expect(out.status).toBe(400);
    expect(out.body?.message).toBe('Malformed request body');
  });

  it('maps a Mongoose CastError to INVALID_ID', () => {
    const out = run({ name: 'CastError' });
    expect([out.status, out.body?.error.code, out.body?.message]).toEqual([400, 'INVALID_ID', 'Invalid ID format']);
  });

  it('maps a Mongoose ValidationError to field details', () => {
    const out = run({ name: 'ValidationError', errors: { title: { path: 'title', message: 'Title is required' } } });
    expect(out.status).toBe(400);
    expect(out.body?.error.details).toEqual([{ field: 'title', message: 'Title is required' }]);
  });

  it('maps duplicate keys to 409 naming the field but never the value', () => {
    const out = run({ code: 11000, keyValue: { email: 'secret@example.com' } });
    expect(out.status).toBe(409);
    expect(out.body?.error.code).toBe('DUPLICATE_ERROR');
    expect(out.body?.message).toBe('email already exists');
    expect(JSON.stringify(out.body)).not.toContain('secret@example.com');
    expect(run({ code: 11000 }).body?.message).toBe('Record already exists');
  });

  it.each(['MongoNetworkError', 'MongoServerSelectionError', 'MongoNotConnectedError', 'MongooseServerSelectionError'])(
    'maps %s to 503',
    (name) => {
      const out = run({ name, message: 'getaddrinfo secret-host' });
      expect([out.status, out.body?.error.code]).toEqual([503, 'DATABASE_UNAVAILABLE']);
      expect(JSON.stringify(out.body)).not.toContain('secret-host');
    },
  );

  it('keeps the message and status of deliberately thrown client errors', () => {
    const out = run({ statusCode: 418, message: 'I am a teapot' });
    expect([out.status, out.body?.message]).toEqual([418, 'I am a teapot']);
    expect(run({ status: 403, message: 'Nope' }).status).toBe(403);
  });

  it('does not echo the message of a thrown 5xx error', () => {
    const out = run({ statusCode: 502, message: 'upstream internals' });
    expect(out.status).toBe(502);
    expect(out.body?.message).toBe('Something went wrong');
  });

  it('never includes a stack trace', () => {
    expect(JSON.stringify(run({ message: 'x' }).body)).not.toMatch(/\.(ts|js):\d+/);
  });
});

describe('hasPermission', () => {
  const user = (permissions: string[]) => ({ user: { permissions } });

  it('answers 401 when nobody is signed in', () => {
    const { res, out } = makeRes();
    const next = vi.fn();
    hasPermission(Permissions.EVENTS_READ)(makeReq(), res, next);
    expect(out.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when every required permission is held, and answers 403 when one is missing', () => {
    const allowed = vi.fn();
    hasPermission(Permissions.EVENTS_READ, Permissions.EVENTS_CREATE)(
      makeReq(user([Permissions.EVENTS_READ, Permissions.EVENTS_CREATE])),
      makeRes().res,
      allowed,
    );
    expect(allowed).toHaveBeenCalledOnce();

    const { res, out } = makeRes();
    const denied = vi.fn();
    hasPermission(Permissions.EVENTS_READ, Permissions.EVENTS_CREATE)(makeReq(user([Permissions.EVENTS_READ])), res, denied);
    expect(out.status).toBe(403);
    expect(out.body?.error.code).toBe('FORBIDDEN');
    expect(denied).not.toHaveBeenCalled();
  });

  it('passes with no requirements for any signed-in user', () => {
    const next = vi.fn();
    hasPermission()(makeReq(user([])), makeRes().res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  describe('hasAnyPermission', () => {
    it('answers 401 when nobody is signed in', () => {
      const { res, out } = makeRes();
      hasAnyPermission(Permissions.EVENTS_READ)(makeReq(), res, vi.fn());
      expect(out.status).toBe(401);
    });

    it('passes with at least one permission and answers 403 with none', () => {
      const next = vi.fn();
      hasAnyPermission(Permissions.CONTENT_MANAGE, Permissions.USERS_MANAGE)(makeReq(user([Permissions.USERS_MANAGE])), makeRes().res, next);
      expect(next).toHaveBeenCalledOnce();

      const { res, out } = makeRes();
      const denied = vi.fn();
      hasAnyPermission(Permissions.CONTENT_MANAGE, Permissions.USERS_MANAGE)(makeReq(user([Permissions.EVENTS_READ])), res, denied);
      expect(out.status).toBe(403);
      expect(denied).not.toHaveBeenCalled();
    });

    it('refuses when the option list is empty', () => {
      const { res, out } = makeRes();
      hasAnyPermission()(makeReq(user([Permissions.EVENTS_READ])), res, vi.fn());
      expect(out.status).toBe(403);
    });
  });
});

describe('isAuthenticated', () => {
  it('passes only an authenticated user', () => {
    const next = vi.fn();
    isAuthenticated(makeReq({ user: { isAuthenticated: true } }), makeRes().res, next);
    expect(next).toHaveBeenCalledOnce();

    for (const req of [makeReq(), makeReq({ user: {} }), makeReq({ user: { isAuthenticated: 'true' } })]) {
      const { res, out } = makeRes();
      const blocked = vi.fn();
      isAuthenticated(req, res, blocked);
      expect(out.status).toBe(401);
      expect(out.body?.error.code).toBe('UNAUTHORIZED');
      expect(blocked).not.toHaveBeenCalled();
    }
  });
});

describe('isStaff', () => {
  it.each([Roles.SUPER_ADMIN, Roles.ADMIN])('lets a %s through', (role) => {
    const next = vi.fn();
    isStaff(makeReq({ user: { role } }), makeRes().res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['member', 'editor', 'ghost', undefined])('refuses %s with 403', (role) => {
    const { res, out } = makeRes();
    const next = vi.fn();
    isStaff(makeReq({ user: { role } }), res, next);
    expect(out.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a request with no user at all', () => {
    const { res, out } = makeRes();
    isStaff(makeReq(), res, vi.fn());
    expect(out.status).toBe(403);
  });
});

describe('isSuperAdmin', () => {
  it('lets only the Super Admin through, whatever permissions the user holds', () => {
    const next = vi.fn();
    isSuperAdmin(makeReq({ user: { role: Roles.SUPER_ADMIN } }), makeRes().res, next);
    expect(next).toHaveBeenCalledOnce();

    for (const req of [
      makeReq({ user: { role: Roles.ADMIN, permissions: [...ALL_PERMISSIONS] } }),
      makeReq({ user: { role: 'member' } }),
      makeReq({ user: {} }),
      makeReq(),
    ]) {
      const { res, out } = makeRes();
      const blocked = vi.fn();
      isSuperAdmin(req, res, blocked);
      expect(out.status).toBe(403);
      expect(blocked).not.toHaveBeenCalled();
    }
  });
});

describe('originGuard', () => {
  const guard = (req: Request) => {
    const { res, out } = makeRes();
    const next = vi.fn();
    originGuard(req, res, next);
    return { out, next };
  };
  const cookie = { [config.session.cookieName]: 'a-session-token' };

  it.each(['GET', 'HEAD', 'OPTIONS'])('never blocks safe %s requests', (method) => {
    const { next } = guard(makeReq({ method, cookies: cookie }, { origin: 'https://evil.example' }));
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('accepts a %s from the front end origin', (method) => {
    const { next } = guard(makeReq({ method, cookies: cookie }, { origin: ORIGIN }));
    expect(next).toHaveBeenCalledOnce();
  });

  it('refuses a foreign Origin with CSRF_INVALID, even without a cookie', () => {
    const { out, next } = guard(makeReq({}, { origin: 'https://evil.example' }));
    expect(out.status).toBe(403);
    expect(out.body?.error.code).toBe('CSRF_INVALID');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not accept look-alike origins', () => {
    for (const origin of [`${ORIGIN}.evil.example`, `${ORIGIN}/`, ORIGIN.replace('http://', 'https://'), 'null']) {
      expect(guard(makeReq({}, { origin })).out.status, origin).toBe(403);
    }
  });

  it('falls back to the Referer when there is no Origin', () => {
    expect(guard(makeReq({}, { referer: `${ORIGIN}/members/me` })).next).toHaveBeenCalledOnce();
    expect(guard(makeReq({}, { referer: 'https://evil.example/page' })).out.status).toBe(403);
    expect(guard(makeReq({}, { referer: 'not a url' })).out.status).toBe(403);
  });

  it('prefers Origin over Referer', () => {
    const { out } = guard(makeReq({}, { origin: 'https://evil.example', referer: `${ORIGIN}/x` }));
    expect(out.status).toBe(403);
  });

  it('lets header-less non-browser clients through, but not when they carry a session cookie', () => {
    expect(guard(makeReq()).next).toHaveBeenCalledOnce();
    const withCookie = guard(makeReq({ cookies: cookie }));
    expect(withCookie.out.status).toBe(403);
    expect(withCookie.next).not.toHaveBeenCalled();
  });

  it('ignores an empty or oversized cookie value when deciding it is a session', () => {
    expect(guard(makeReq({ cookies: { [config.session.cookieName]: '' } })).next).toHaveBeenCalledOnce();
    expect(guard(makeReq({ cookies: { [config.session.cookieName]: 'x'.repeat(129) } })).next).toHaveBeenCalledOnce();
  });
});
