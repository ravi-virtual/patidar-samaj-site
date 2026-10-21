// Safety net: discovers every route from the route files and proves that anything not explicitly
// listed as public is closed to anonymous callers, and that state-changing routes demand the CSRF
// token. A new endpoint added without authentication fails here until it is deliberately listed.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ORIGIN, anon, connectTestDb, disconnectTestDb, resetDb, signInAs } from '../helpers';
import { Roles } from '../../src/config/constants';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const routesDir = join(__dirname, '..', '..', 'src', 'routes');
const indexSource = readFileSync(join(routesDir, 'index.ts'), 'utf8');

// "router.use('/members', memberRoutes)" → memberRoutes mounted at /api/members
const mounts = [...indexSource.matchAll(/router\.use\('([^']+)',\s*(\w+)\)/g)].map((m) => ({ prefix: m[1]!, file: m[2]! }));

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string; // as mounted, e.g. /api/members/:id
}

const discovered: Route[] = [];
for (const { prefix, file } of mounts) {
  const src = readFileSync(join(routesDir, `${file}.ts`), 'utf8');
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
    const sub = m[2] === '/' ? '' : m[2]!;
    discovered.push({ method: m[1] as Route['method'], path: `/api${prefix}${sub}` });
  }
}
// Routes declared directly in index.ts (e.g. search).
for (const m of indexSource.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) {
  discovered.push({ method: m[1] as Route['method'], path: `/api${m[2]}` });
}

/** Public on purpose. Each entry is a decision someone made; everything else must require sign-in. */
const PUBLIC = new Set([
  'get /api/health',
  'post /api/auth/register',
  'post /api/auth/login',
  'post /api/auth/forgot-password',
  'post /api/auth/reset-password',
  'get /api/members',
  'get /api/members/filters',
  'get /api/members/:id',
  'get /api/events',
  'get /api/events/:id',
  'get /api/announcements',
  'get /api/announcements/:id',
  'get /api/content/blocks',
  'get /api/content/blocks/:key',
  'get /api/content/committee',
  'get /api/content/:resource',
  'post /api/contact',
  'get /api/media/:id',
  'get /api/public/home',
  'get /api/public/settings',
  'get /api/search',
]);

const concrete = (path: string) =>
  path
    .replace(':registrationId', '22222222-2222-4222-8222-222222222222')
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

  it('every /api/admin and /api/users route refuses a plain member', async () => {
    const { client } = await signInAs(Roles.MEMBER);
    const failures: string[] = [];
    for (const r of protectedRoutes.filter((x) => /^\/api\/(admin|users)/.test(x.path))) {
      const res = await client[r.method === 'delete' ? 'del' : r.method](concrete(r.path)).send({});
      if (res.status !== 403) failures.push(`${key(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('public routes never leak server internals', () => {
  it('unknown paths and methods return the standard error shape without stack traces', async () => {
    for (const path of ['/api/nope', '/api/admin/nope', '/api/members/x/y/z']) {
      const res = await anon().get(path);
      expect([401, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\.ts:\d+|at .*\(/);
    }
  });
});
