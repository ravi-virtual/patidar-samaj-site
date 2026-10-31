import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import MemberProfile from '../../src/models/MemberProfile';
import { Roles } from '../../src/config/constants';
import {
  OPS_ADMIN_PERMISSIONS,
  READ_ONLY_ADMIN_PERMISSIONS,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeProfile,
  resetDb,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const PRIVATE_KEYS = ['phone', 'email', 'familySize', 'kul', 'userId', 'passwordHash', 'membershipStatus', 'visibility'];

describe('public member directory', () => {
  it('shows only public, active entries; hidden and legacy "members" entries stay with the office', async () => {
    await makeProfile({ displayName: 'Public Pat', visibility: 'public' });
    await makeProfile({ displayName: 'Hidden Hari', visibility: 'hidden' });
    await makeProfile({ displayName: 'Lapsed Lal', visibility: 'public', membershipStatus: 'inactive' });
    // Old data may still say "members"; it must be treated as hidden.
    const legacy = await makeProfile({ displayName: 'Legacy Members' });
    await MemberProfile.collection.updateOne({ _id: legacy._id as never }, { $set: { visibility: 'members' } });

    const res = await anon().get('/api/members');
    expect(res.status).toBe(200);
    expect(res.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Public Pat']);
    expect(res.body.data.totalCount).toBe(1);
    expect((await anon().get(`/api/members/${legacy._id}`)).status).toBe(404);
  });

  it('gives a signed-in admin the same public view (there is no member-level visibility)', async () => {
    await makeProfile({ displayName: 'Public Pat', visibility: 'public' });
    await makeProfile({ displayName: 'Hidden Hari', visibility: 'hidden' });
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.get('/api/members');
    expect(res.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Public Pat']);
  });

  it('never includes private or internal fields in a directory response', async () => {
    await makeProfile({
      displayName: 'Rich Record',
      visibility: 'public',
      phone: '+91 98250 00001',
      familySize: 5,
      kul: 'Kul 7',
      bio: 'Public bio',
      occupation: 'Engineer',
    });
    const res = await anon().get('/api/members');
    const entry = res.body.data.members[0];
    for (const key of PRIVATE_KEYS) expect(entry).not.toHaveProperty(key);
    expect(JSON.stringify(res.body)).not.toMatch(/98250|Kul 7/);
    expect(entry).toMatchObject({ name: 'Rich Record', occupation: 'Engineer', bio: 'Public bio' });
  });

  it('also keeps private fields out of the single-member response', async () => {
    const p = await makeProfile({ visibility: 'public', phone: '+91 98250 00002', familySize: 4 });
    const res = await anon().get(`/api/members/${p._id}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/98250|familySize/);
  });

  it('returns 404, not 403, for a hidden entry (no existence leak)', async () => {
    const hidden = await makeProfile({ visibility: 'hidden' });
    expect((await anon().get(`/api/members/${hidden._id}`)).status).toBe(404);
  });

  it('does not list anonymised entries', async () => {
    await makeProfile({ displayName: 'Gone', visibility: 'public' });
    await MemberProfile.updateMany({}, { $set: { anonymizedAt: new Date() } });
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);
  });

  it('has no own-profile or member-registration endpoints', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.get('/api/members/me')).status).toBe(400); // "me" is just a malformed id now
    expect((await client.patch('/api/members/me').send({ city: 'x' })).status).toBe(404);
    expect((await client.get('/api/members/me/registrations')).status).toBe(404);
  });
});

describe('directory search, filters and paging', () => {
  beforeEach(async () => {
    await makeProfile({ displayName: 'Anil Patel', village: 'Unjha', city: 'Mehsana' });
    await makeProfile({ displayName: 'Bhavna Patel', village: 'Visnagar', city: 'Vadodara' });
    await makeProfile({ displayName: 'Chirag Shah', village: 'Unjha', city: 'Leicester', country: 'United Kingdom' });
    await makeProfile({ displayName: 'Deepa Mehta', village: 'Kadi', city: 'Ahmedabad' });
  });

  const names = (res: { body: { data: { members: { name: string }[] } } }) => res.body.data.members.map((m) => m.name);

  it('searches by name, village or city, ignoring case', async () => {
    expect(names(await anon().get('/api/members?search=patel'))).toEqual(['Anil Patel', 'Bhavna Patel']);
    expect(names(await anon().get('/api/members?search=KADI'))).toEqual(['Deepa Mehta']);
    expect(names(await anon().get('/api/members?search=leic'))).toEqual(['Chirag Shah']);
  });

  it('filters by village, city and country exactly', async () => {
    expect(names(await anon().get('/api/members?village=unjha'))).toEqual(['Anil Patel', 'Chirag Shah']);
    expect(names(await anon().get('/api/members?city=Vadodara'))).toEqual(['Bhavna Patel']);
    expect(names(await anon().get('/api/members?country=United%20Kingdom'))).toEqual(['Chirag Shah']);
    expect(names(await anon().get('/api/members?village=Unj'))).toEqual([]); // exact, not prefix
  });

  it('pages and reports the total', async () => {
    const first = await anon().get('/api/members?limit=3&page=1');
    const second = await anon().get('/api/members?limit=3&page=2');
    expect(first.body.data.members).toHaveLength(3);
    expect(second.body.data.members).toHaveLength(1);
    expect(first.body.data.totalCount).toBe(4);
    expect(Object.keys(first.body.data).sort()).toEqual(['members', 'totalCount']); // skill: totalCount only
  });

  it('sorts by name either way', async () => {
    expect(names(await anon().get('/api/members?sort=-name'))[0]).toBe('Deepa Mehta');
    expect(names(await anon().get('/api/members?sort=name'))[0]).toBe('Anil Patel');
  });

  it('treats search text literally and rejects bad parameters', async () => {
    expect(names(await anon().get('/api/members?search=.*'))).toEqual([]);
    expect((await anon().get('/api/members?limit=500')).status).toBe(400);
    expect((await anon().get('/api/members?page=0')).status).toBe(400);
    expect((await anon().get('/api/members?sort=password')).status).toBe(400);
  });

  it('lists the villages and cities available for filter menus', async () => {
    const res = await anon().get('/api/members/filters');
    expect(res.body.data.villages).toEqual(['Kadi', 'Unjha', 'Visnagar']);
    expect(res.body.data.cities).toContain('Leicester');
  });

  it('returns 404 for unknown ids and 400 for malformed ones', async () => {
    expect((await anon().get('/api/members/11111111-1111-4111-8111-111111111111')).status).toBe(404);
    expect((await anon().get('/api/members/not-a-uuid')).status).toBe(400);
  });
});

describe('admin directory management', () => {
  const MEMBER_PERMS = ['members.read', 'members.create', 'members.update'];

  it('lets admins with members.read list entries but hides private fields from them', async () => {
    await makeProfile({ displayName: 'Entry One', phone: '+91 98250 00004', familySize: 6, kul: 'Kul 1' });
    await makeProfile({ displayName: 'Office Entry', phone: '+91 98250 00005', familySize: 2 });

    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await client.get('/api/admin/members');
    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(2);
    expect(JSON.stringify(res.body)).not.toMatch(/98250|familySize|Kul 1/);

    const { client: priv } = await signInAs(Roles.ADMIN, { permissions: ['members.read', 'members.read.private'] });
    const full = await priv.get('/api/admin/members');
    expect(JSON.stringify(full.body)).toMatch(/98250 00004/);
    expect(JSON.stringify(full.body)).toMatch(/98250 00005/);
  });

  it('exposes no account fields in the admin list', async () => {
    await makeProfile({ displayName: 'Plain Entry' });
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const entry = (await client.get('/api/admin/members')).body.data.members[0];
    for (const key of ['userId', 'hasAccount', 'accountStatus']) expect(entry).not.toHaveProperty(key);
    expect(entry).toMatchObject({ visibility: 'public', membershipStatus: 'active' });
  });

  it('filters by membership, visibility (legacy "members" counts as office only) and search', async () => {
    await makeProfile({ displayName: 'Active Public', visibility: 'public' });
    await makeProfile({ displayName: 'Inactive One', membershipStatus: 'inactive', visibility: 'hidden' });
    const legacy = await makeProfile({ displayName: 'Legacy Entry' });
    await MemberProfile.collection.updateOne({ _id: legacy._id as never }, { $set: { visibility: 'members' } });
    const { client } = await signInAs(Roles.ADMIN, { permissions: MEMBER_PERMS });

    expect((await client.get('/api/admin/members?membershipStatus=inactive')).body.data.members[0].name).toBe('Inactive One');
    expect((await client.get('/api/admin/members?visibility=public')).body.data.totalCount).toBe(1);
    const hidden = await client.get('/api/admin/members?visibility=hidden');
    expect(hidden.body.data.totalCount).toBe(2);
    expect(hidden.body.data.members.every((m: { visibility: string }) => m.visibility === 'hidden')).toBe(true);
    expect((await client.get('/api/admin/members?search=entry')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/members?visibility=members')).status).toBe(400);
    expect((await client.get('/api/admin/members?accountStatus=pending')).status).toBe(200); // unknown filters are simply ignored
    expect((await client.get('/api/admin/members?membershipStatus=pending')).status).toBe(400);
  });

  it('lets admins add entries, but not private details without the private permission', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: MEMBER_PERMS });
    const ok = await client.post('/api/admin/members').send({ displayName: 'New Entry', village: 'Kadi', city: 'Surat', visibility: 'public' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.member).toMatchObject({ visibility: 'public' });

    const defaulted = await client.post('/api/admin/members').send({ displayName: 'Default Entry' });
    expect(defaulted.body.data.member).toMatchObject({ visibility: 'hidden', membershipStatus: 'active' });

    const withPhone = await client.post('/api/admin/members').send({ displayName: 'Phone Entry', phone: '+91 98250 00006' });
    expect(withPhone.status).toBe(403);
    expect(await MemberProfile.countDocuments({ displayName: 'Phone Entry' })).toBe(0);
    expect((await client.post('/api/admin/members').send({ displayName: 'Bad Vis', visibility: 'members' })).status).toBe(400);
  });

  it('lets the Super Admin record private details', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.post('/api/admin/members').send({ displayName: 'Full Entry', phone: '+91 98250 00007', familySize: 3, kul: 'Kul 4' });
    expect(res.status).toBe(201);
    expect(res.body.data.member).toMatchObject({ phone: '+91 98250 00007', familySize: 3, kul: 'Kul 4' });
  });

  it('ignores ids, deletion flags and account links sent by the client', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: MEMBER_PERMS });
    const res = await client.post('/api/admin/members').send({ displayName: 'Sneaky', userId: 'some-user', _id: 'x', isDeleted: true });
    expect(res.status).toBe(201);
    const stored = await MemberProfile.findOne({ displayName: 'Sneaky' }).lean();
    expect(stored?.isDeleted).toBe(false);
    expect(stored?._id).not.toBe('x');
    expect(stored).not.toHaveProperty('userId');
  });

  it('updates an entry, and needs the private permission for private fields', async () => {
    const profile = await makeProfile({ displayName: 'Old Name' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: MEMBER_PERMS });
    const res = await client.patch(`/api/admin/members/${profile._id}`).send({ displayName: 'New Name', village: 'Sidhpur', highlighted: true, visibility: 'public' });
    expect(res.status).toBe(200);
    expect(await MemberProfile.findById(profile._id).lean()).toMatchObject({ displayName: 'New Name', village: 'Sidhpur', highlighted: true, visibility: 'public' });

    expect((await client.patch(`/api/admin/members/${profile._id}`).send({ phone: '+91 98250 00008' })).status).toBe(403);
    expect((await client.patch(`/api/admin/members/${profile._id}`).send({ familySize: 3 })).status).toBe(403);
    expect((await client.patch(`/api/admin/members/${profile._id}`).send({ membershipStatus: 'inactive' })).status).toBe(200);
    expect((await client.patch('/api/admin/members/11111111-1111-4111-8111-111111111111').send({ village: 'X' })).status).toBe(404);
  });

  it('forbids admins without the permission from changing members', async () => {
    const entry = await makeProfile();
    for (const permissions of [[], READ_ONLY_ADMIN_PERMISSIONS]) {
      const { client } = await signInAs(Roles.ADMIN, { permissions });
      expect((await client.patch(`/api/admin/members/${entry._id}`).send({ village: 'X' })).status).toBe(403);
      expect((await client.post('/api/admin/members').send({ displayName: 'Nope Nope' })).status).toBe(403);
      expect((await client.post(`/api/admin/members/${entry._id}/anonymize`)).status).toBe(403);
    }
    expect((await MemberProfile.findById(entry._id).lean())?.village).toBe('Unjha');
  });

  it('has no approve, suspend, reactivate or create-account actions on entries', async () => {
    const entry = await makeProfile();
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    for (const action of ['create-account', 'approve', 'suspend', 'reactivate']) {
      expect((await client.post(`/api/admin/members/${entry._id}/${action}`).send({ email: 'a@example.test' })).status, action).toBe(404);
    }
  });

  it('anonymises an entry only with members.anonymize', async () => {
    const profile = await makeProfile({ displayName: 'Real Person', bio: 'Bio', village: 'Kadi', visibility: 'public', highlighted: true });

    const { client: plain } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await plain.post(`/api/admin/members/${profile._id}/anonymize`)).status).toBe(403);

    const { client: granted } = await signInAs(Roles.ADMIN, { permissions: ['members.anonymize'] });
    expect((await granted.post(`/api/admin/members/${profile._id}/anonymize`)).status).toBe(200);

    const stored = await MemberProfile.findById(profile._id).lean();
    expect(stored).toMatchObject({ displayName: 'Former member', visibility: 'hidden', membershipStatus: 'inactive', highlighted: false });
    expect(stored?.bio).toBeUndefined();
    expect(stored?.village).toBeUndefined();
    expect(stored?.anonymizedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'member.anonymized' })).toBe(1);
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);
  });
});

describe('member export', () => {
  const seed = async () => {
    await makeProfile({ displayName: '=HYPERLINK("http://evil","click")', village: 'Unjha', phone: '+91 98250 00010', familySize: 4 });
    await makeProfile({ displayName: 'Normal Person', village: 'Kadi' });
  };

  it('is refused without members.export, and to visitors', async () => {
    await seed();
    for (const permissions of [[], OPS_ADMIN_PERMISSIONS, READ_ONLY_ADMIN_PERMISSIONS]) {
      const { client } = await signInAs(Roles.ADMIN, { permissions });
      expect((await client.get('/api/admin/members/export')).status).toBe(403);
    }
    expect((await anon().get('/api/admin/members/export')).status).toBe(401);
  });

  it('is available with members.export, without private columns', async () => {
    await seed();
    const { client } = await signInAs(Roles.ADMIN, { permissions: ['members.export'] });
    const res = await client.get('/api/admin/members/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="members-/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('Normal Person');
    expect(res.text).not.toMatch(/98250|Phone|Family size/);
  });

  it('includes private columns for the Super Admin, neutralises spreadsheet formulas and is audited', async () => {
    await seed();
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.get('/api/admin/members/export?village=Unjha');
    expect(res.text).toContain('Phone');
    expect(res.text).toContain('98250 00010');
    expect(res.text).toContain(`"'=HYPERLINK`); // the formula is defanged with a leading apostrophe
    expect(res.text).not.toContain('Normal Person'); // honours the filter
    const audit = await AuditLog.findOne({ action: 'members.exported' }).lean();
    expect(audit?.metadata).toMatchObject({ count: 1, includedPrivate: true });
  });
});
