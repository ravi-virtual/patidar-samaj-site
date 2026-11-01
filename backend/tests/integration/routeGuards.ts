// Safety net: discovers every route from the route files and proves that anything not explicitly
// listed as public is closed to anonymous callers, and that state-changing routes demand the CSRF
// token. A new endpoint added without authentication fails here until it is deliberately listed.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_PERMISSIONS_WITHOUT_USER_RESET, ORIGIN, anon, connectTestDb, disconnectTestDb, resetDb, signInAs } from '../helpers';
import { Roles } from '../../src/config/constants';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const routesDir = join(__dirname, '..', '..', 'src', 'routes');
const indexSource = readFileSync(join(routesDir, 'index.ts'), 'utf8');

// "router.use('/members', memberRoutes)" → memberRoutes mounted at /members
const mounts = [...indexSource.matchAll(/router\.use\('([^']+)',\s*(\w+)\)/g)].map((m) => ({ prefix: m[1]!, file: m[2]! }));

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string; // as mounted, e.g. /members/:id
}

const discovered: Route[] = [];
for (const { prefix, file } of mounts) {
  const src = readFileSync(join(routesDir, `${file}.ts`), 'utf8');
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
    const sub = m[2] === '/' ? '' : m[2]!;
    discovered.push({ method: m[1] as Route['method'], path: `${prefix}${sub}` });
  }
}
// Routes declared directly in index.ts (e.g. search).
for (const m of indexSource.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) {
  discovered.push({ method: m[1] as Route['method'], path: `${m[2]}` });
}

/** Public on purpose. Each entry is a decision someone made; everything else must require sign-in. */
const PUBLIC = new Set([
  'get /hc',
  'post /auth/admin-login',
  'post /auth/forgot-password',
  'post /auth/reset-password',
  'get /members',
  'get /members/filters',
  'get /members/:id',
  'get /events',
  'get /events/:id',
  'get /announcements',
  'get /announcements/:id',
  'get /content/blocks',
  'get /content/blocks/:key',
  'get /content/committee',
  'get /content/:resource',
  'post /contact',
  'get /media/:id',
  'get /public/home',
  'get /public/settings',
  'get /search',
]);

const concrete = (path: string) =>
  path
    .replace(':resource', 'faqs')
    .replace(':key', 'about.mission')
    .replace(':id', '11111111-1111-4111-8111-111111111111');

const key = (r: Route) => `${r.method} ${r.path}`;
const protectedRoutes = discovered.filter((r) => !PUBLIC.has(key(r)));

describe('route inventory', () => {
  it('finds the routes (guards against the scanner silently finding nothing)', () => {
    expect(discovered.length).toBeGreaterThan(80);
    expect(readdirSync(routesDir).filter((f) => f.endsWith('Routes.ts')).length).toBeGreaterThanOrEqual(17);
  });

  it('every entry on the public list still exists (no stale exemptions)', () => {
    const found = new Set(discovered.map(key));
    for (const p of PUBLIC) expect(found.has(p), `public list entry not found: ${p}`).toBe(true);
  });
});

describe('routes that are not public', () => {
  it(`all ${protectedRoutes.length} reject anonymous callers with 401`, async () => {
    const failures: string[] = [];
    for (const r of protectedRoutes) {
      let req = anon()[r.method](concrete(r.path));
      if (r.method !== 'get') req = req.set('Origin', ORIGIN).send({});
      const res = await req;
      if (res.status !== 401) failures.push(`${key(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('all state-changing ones refuse a signed-in user who omits the CSRF token', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN); // the most privileged user, so only CSRF can stop it
    const failures: string[] = [];
    for (const r of protectedRoutes.filter((x) => x.method !== 'get')) {
      const res = await client.agent[r.method](concrete(r.path)).set('Origin', ORIGIN).send({});
      if (res.status !== 403) failures.push(`${key(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('has no member sign-in or registration route at all', () => {
    const found = new Set(discovered.map(key));
    expect(found.has('post /auth/register')).toBe(false);
    expect(found.has('post /auth/login')).toBe(false);
    expect(found.has('get /members/me')).toBe(false);
    expect(found.has('patch /members/me')).toBe(false);
    expect(found.has('get /admin/roles')).toBe(false);
  });

  it('every /admin and /users route refuses an admin who holds no permissions', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: [] });
    const failures: string[] = [];
    for (const r of protectedRoutes.filter((x) => /^\/api\/(admin|users)/.test(x.path))) {
      const res = await client[r.method === 'delete' ? 'del' : r.method](concrete(r.path)).send({});
      if (res.status !== 403) failures.push(`${key(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('admin account management', () => {
  it('every /users route refuses an admin without users.reset_password, even with every other selectable permission', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: ADMIN_PERMISSIONS_WITHOUT_USER_RESET });
    const failures: string[] = [];
    const userRoutes = protectedRoutes.filter((x) => x.path.startsWith('/users'));
    expect(userRoutes.length).toBeGreaterThanOrEqual(8);
    for (const r of userRoutes) {
      const res = await client[r.method === 'delete' ? 'del' : r.method](concrete(r.path)).send({});
      if (res.status !== 403) failures.push(`${key(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('public routes never leak server internals', () => {
  it('unknown paths and methods return the standard error shape without stack traces', async () => {
    for (const path of ['/nope', '/admin/nope', '/members/x/y/z']) {
      const res = await anon().get(path);
      expect([401, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\.ts:\d+|at .*\(/);
    }
  });
});
