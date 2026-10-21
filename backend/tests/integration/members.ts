import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import MemberProfile from '../../src/models/MemberProfile';
import OrganizationSettings from '../../src/models/OrganizationSettings';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import { AccountStatus, Roles } from '../../src/config/constants';
import {
  ORIGIN,
  PASSWORD,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeProfile,
  makeUser,
  resetDb,
  signIn,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const PRIVATE_KEYS = ['phone', 'email', 'familySize', 'kul', 'userId', 'passwordHash', 'membershipStatus', 'visibility'];

describe('member directory privacy', () => {
  it('shows visitors only entries their owner made public, and only active ones', async () => {
    await makeProfile({ displayName: 'Public Pat', visibility: 'public' });
    await makeProfile({ displayName: 'Members Only', visibility: 'members' });
    await makeProfile({ displayName: 'Hidden Hari', visibility: 'hidden' });
    await makeProfile({ displayName: 'Pending Priya', visibility: 'public', membershipStatus: 'pending' });
    await makeProfile({ displayName: 'Lapsed Lal', visibility: 'public', membershipStatus: 'inactive' });

    const res = await anon().get('/api/members');
    expect(res.status).toBe(200);
    expect(res.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Public Pat']);
    expect(res.body.data.totalCount).toBe(1);
  });

  it('gives signed-in members the members-level entries too, but never hidden ones', async () => {
    await makeProfile({ displayName: 'Public Pat', visibility: 'public' });
    await makeProfile({ displayName: 'Members Only', visibility: 'members' });
    await makeProfile({ displayName: 'Hidden Hari', visibility: 'hidden' });
    const { client } = await signInAs(Roles.MEMBER);
    const res = await client.get('/api/members?sort=name');
    expect(res.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Members Only', 'Public Pat']);
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

  it('returns 404, not 403, for an entry the visitor may not see (no existence leak)', async () => {
    const members = await makeProfile({ visibility: 'members' });
    const hidden = await makeProfile({ visibility: 'hidden' });
    expect((await anon().get(`/api/members/${members._id}`)).status).toBe(404);
    expect((await anon().get(`/api/members/${hidden._id}`)).status).toBe(404);
    const { client } = await signInAs(Roles.MEMBER);
    expect((await client.get(`/api/members/${members._id}`)).status).toBe(200);
    expect((await client.get(`/api/members/${hidden._id}`)).status).toBe(404);
  });

  it('can be switched to members-only by the organisation settings', async () => {
    await OrganizationSettings.create({ key: 'main', directoryPublic: false });
    await makeProfile({ visibility: 'public' });
    const visitor = await anon().get('/api/members');
    expect(visitor.status).toBe(401);
    const { client } = await signInAs(Roles.MEMBER);
    expect((await client.get('/api/members')).status).toBe(200);
  });

  it('does not list anonymised entries', async () => {
    await makeProfile({ displayName: 'Gone', visibility: 'public' });
    await MemberProfile.updateMany({}, { $set: { anonymizedAt: new Date() } });
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);
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

describe('registration → approval → directory', () => {
  it('creates a pending profile at registration, and the member appears only after approval', async () => {
    await anon()
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({
        name: 'Nita Patel',
        email: 'nita@example.test',
        phone: '+91 98250 55555',
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acknowledge: true,
      });
    const user = await User.findOne({ email: 'nita@example.test' }).lean();
    const profile = await MemberProfile.findOne({ userId: user!._id }).lean();
    expect(profile?.membershipStatus).toBe('pending');
    expect(profile?.visibility).toBe('members');

    const { client: admin } = await signInAs(Roles.ADMIN);
    await MemberProfile.updateOne({ _id: profile!._id }, { $set: { visibility: 'public' } });
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);

    await admin.post(`/api/users/${user!._id}/approve`);
    const after = await anon().get('/api/members');
    expect(after.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Nita Patel']);

    await admin.post(`/api/users/${user!._id}/suspend`).send({});
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);
    await admin.post(`/api/users/${user!._id}/reactivate`);
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(1);
  });

  it('does not list a rejected registration', async () => {
    const user = await makeUser({ status: AccountStatus.PENDING });
    await makeProfile({ userId: user._id, displayName: user.name, visibility: 'public', membershipStatus: 'pending' });
    const { client: admin } = await signInAs(Roles.ADMIN);
    await admin.post(`/api/users/${user._id}/reject`).send({ reason: 'unknown' });
    expect((await anon().get('/api/members')).body.data.totalCount).toBe(0);
  });
});

describe('own profile', () => {
  const setup = async () => {
    const user = await makeUser({ phone: '+91 98250 00003' });
    const profile = await makeProfile({ userId: user._id, displayName: user.name, familySize: 3, kul: 'Kul 9', visibility: 'members' });
    const client = await signIn(user.email);
    return { user, profile, client };
  };

  it('shows the owner their private details', async () => {
    const { client, user } = await setup();
    const res = await client.get('/api/members/me');
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ familySize: 3, kul: 'Kul 9', phone: '+91 98250 00003', visibility: 'members' });
    expect(res.body.data.profile.name).toBe(user.name);
  });

  it('lets members edit their own allowed fields and directory visibility', async () => {
    const { client, profile, user } = await setup();
    const res = await client.patch('/api/members/me').send({
      village: 'Kalol',
      city: 'Edison, NJ',
      country: 'United States',
      occupation: 'Pharmacist',
      bio: 'Hello',
      familySize: 4,
      phone: '+1 201 555 0100',
      visibility: 'public',
    });
    expect(res.status).toBe(200);
    const stored = await MemberProfile.findById(profile._id).lean();
    expect(stored).toMatchObject({ village: 'Kalol', country: 'United States', visibility: 'public', familySize: 4 });
    expect((await User.findById(user._id).lean())?.phone).toBe('+1 201 555 0100');
    expect(await AuditLog.countDocuments({ action: 'member.visibility_changed' })).toBe(1);
  });

  it('ignores fields members may not change (name, status, links, roles)', async () => {
    const { client, profile, user } = await setup();
    const res = await client.patch('/api/members/me').send({
      city: 'Surat',
      displayName: 'Hacked Name',
      membershipStatus: 'inactive',
      userId: 'someone-else',
      highlighted: true,
      role: 'superadmin',
      status: 'suspended',
    });
    expect(res.status).toBe(200);
    const stored = await MemberProfile.findById(profile._id).lean();
    expect(stored?.city).toBe('Surat');
    expect(stored?.displayName).toBe(user.name);
    expect(stored?.membershipStatus).toBe('active');
    expect(stored?.userId).toBe(user._id);
    expect(stored?.highlighted).toBe(false);
    expect((await User.findById(user._id).lean())).toMatchObject({ role: 'member', status: 'active' });
  });

  it('rejects invalid values', async () => {
    const { client } = await setup();
    expect((await client.patch('/api/members/me').send({ visibility: 'everyone' })).status).toBe(400);
    expect((await client.patch('/api/members/me').send({ familySize: 500 })).status).toBe(400);
    expect((await client.patch('/api/members/me').send({ bio: '<script>x</script>' })).status).toBe(400);
    expect((await client.patch('/api/members/me').send({ phone: 'abc' })).status).toBe(400);
  });

  it('requires sign-in and the CSRF token', async () => {
    const { client } = await setup();
    expect((await anon().get('/api/members/me')).status).toBe(401);
    expect((await anon().patch('/api/members/me').set('Origin', ORIGIN).send({ city: 'x' })).status).toBe(401);
    const noCsrf = await client.agent.patch('/api/members/me').set('Origin', ORIGIN).send({ city: 'x' });
    expect(noCsrf.status).toBe(403);
  });

  it('never lets one member read another member’s private data', async () => {
    const { client } = await setup();
    const other = await makeUser({ phone: '+91 98250 77777' });
    const otherProfile = await makeProfile({ userId: other._id, displayName: other.name, familySize: 8, kul: 'Secret Kul', visibility: 'members' });
    const res = await client.get(`/api/members/${otherProfile._id}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/98250 77777|Secret Kul|familySize|phone|email/);
    // /me always returns the caller's own profile, whatever the request says.
    const me = await client.get(`/api/members/me?id=${otherProfile._id}`);
    expect(me.body.data.profile.kul).toBe('Kul 9');
  });

  it('is not available to the admin endpoints', async () => {
    const { client } = await setup();
    expect((await client.get('/api/admin/members')).status).toBe(403);
    expect((await client.get('/api/admin/members/export')).status).toBe(403);
  });
});

describe('staff member management', () => {
  it('lets Viewers and Admins list members but hides private fields from them', async () => {
    const user = await makeUser({ phone: '+91 98250 00004' });
    await makeProfile({ userId: user._id, displayName: user.name, familySize: 6, kul: 'Kul 1', phone: undefined });
    await makeProfile({ displayName: 'Office Entry', phone: '+91 98250 00005', familySize: 2 });

    for (const role of [Roles.VIEWER, Roles.ADMIN]) {
      const { client } = await signInAs(role);
      const res = await client.get('/api/admin/members');
      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBe(2);
      expect(JSON.stringify(res.body)).not.toMatch(/98250|familySize|Kul 1/);
    }

    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const full = await sa.get('/api/admin/members');
    expect(JSON.stringify(full.body)).toMatch(/98250 00004/);
    expect(JSON.stringify(full.body)).toMatch(/98250 00005/);
    expect(JSON.stringify(full.body)).not.toMatch(/passwordHash/);
  });

  it('filters by status, visibility and whether the entry has an account', async () => {
    const user = await makeUser();
    await makeProfile({ userId: user._id, displayName: 'Has Account', membershipStatus: 'pending', visibility: 'members' });
    await makeProfile({ displayName: 'No Account', visibility: 'hidden' });
    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.get('/api/admin/members?membershipStatus=pending')).body.data.members[0].name).toBe('Has Account');
    expect((await client.get('/api/admin/members?hasAccount=false')).body.data.members[0].name).toBe('No Account');
    expect((await client.get('/api/admin/members?visibility=hidden')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/members?search=account')).body.data.totalCount).toBe(2);
  });

  it('lets Admins add office entries, but not private details', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const ok = await client.post('/api/admin/members').send({ displayName: 'New Entry', village: 'Kadi', city: 'Surat', visibility: 'members' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.member.hasAccount).toBe(false);

    const withPhone = await client.post('/api/admin/members').send({ displayName: 'Phone Entry', phone: '+91 98250 00006' });
    expect(withPhone.status).toBe(403);
    expect(await MemberProfile.countDocuments({ displayName: 'Phone Entry' })).toBe(0);
  });

  it('lets a Super Admin record private details', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.post('/api/admin/members').send({ displayName: 'Full Entry', phone: '+91 98250 00007', familySize: 3, kul: 'Kul 4' });
    expect(res.status).toBe(201);
    expect(res.body.data.member).toMatchObject({ phone: '+91 98250 00007', familySize: 3, kul: 'Kul 4' });
  });

  it('cannot create an entry linked to an account or with an arbitrary id', async () => {
    const victim = await makeUser();
    const { client } = await signInAs(Roles.ADMIN);
    const res = await client.post('/api/admin/members').send({ displayName: 'Sneaky', userId: victim._id, _id: 'x', isDeleted: true });
    expect(res.status).toBe(201);
    const stored = await MemberProfile.findOne({ displayName: 'Sneaky' }).lean();
    expect(stored?.userId).toBeNull();
    expect(stored?.isDeleted).toBe(false);
  });

  it('updates an entry; a name change on an account holder also updates the account', async () => {
    const user = await makeUser({ name: 'Old Name' });
    const profile = await makeProfile({ userId: user._id, displayName: 'Old Name' });
    const { client } = await signInAs(Roles.ADMIN);
    const res = await client.patch(`/api/admin/members/${profile._id}`).send({ displayName: 'New Name', village: 'Sidhpur', highlighted: true });
    expect(res.status).toBe(200);
    expect((await User.findById(user._id).lean())?.name).toBe('New Name');
    expect(await MemberProfile.findById(profile._id).lean()).toMatchObject({ displayName: 'New Name', village: 'Sidhpur', highlighted: true });
  });

  it('keeps private edits and account-status edits out of reach of ordinary updates', async () => {
    const user = await makeUser();
    const withAccount = await makeProfile({ userId: user._id });
    const officeEntry = await makeProfile();
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.patch(`/api/admin/members/${officeEntry._id}`).send({ phone: '+91 98250 00008' })).status).toBe(403);
    expect((await admin.patch(`/api/admin/members/${officeEntry._id}`).send({ familySize: 3 })).status).toBe(403);
    expect((await admin.patch(`/api/admin/members/${withAccount._id}`).send({ membershipStatus: 'inactive' })).status).toBe(409);
    expect((await admin.patch(`/api/admin/members/${officeEntry._id}`).send({ membershipStatus: 'inactive' })).status).toBe(200);
  });

  it('forbids Editors and Viewers from changing members', async () => {
    const entry = await makeProfile();
    for (const role of [Roles.EDITOR, Roles.VIEWER]) {
      const { client } = await signInAs(role);
      expect((await client.patch(`/api/admin/members/${entry._id}`).send({ village: 'X' })).status).toBe(403);
      expect((await client.post('/api/admin/members').send({ displayName: 'Nope Nope' })).status).toBe(403);
    }
    expect((await MemberProfile.findById(entry._id).lean())?.village).toBe('Unjha');
  });

  it('anonymises a member for Super Admin only, and signs them out', async () => {
    const user = await makeUser({ phone: '+91 98250 00009' });
    const profile = await makeProfile({ userId: user._id, displayName: user.name, bio: 'Bio', village: 'Kadi', phone: undefined });
    const memberClient = await signIn(user.email);

    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/admin/members/${profile._id}/anonymize`)).status).toBe(403);

    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/admin/members/${profile._id}/anonymize`)).status).toBe(200);

    const stored = await MemberProfile.findById(profile._id).lean();
    expect(stored).toMatchObject({ displayName: 'Former member', visibility: 'hidden', membershipStatus: 'inactive' });
    expect(stored?.bio).toBeUndefined();
    expect(stored?.village).toBeUndefined();
    expect(stored?.anonymizedAt).toBeTruthy();

    const account = await User.findById(user._id).select('+passwordHash').lean();
    expect(account).toMatchObject({ name: 'Former member', isDeleted: true, status: 'suspended' });
    expect(account?.email).toMatch(/^removed\+/);
    expect(account?.passwordHash).toBeNull();
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
    expect((await memberClient.get('/api/auth/me')).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'member.anonymized' })).toBe(1);
  });

  it('does not anonymise a staff account', async () => {
    const staff = await makeUser({ role: Roles.EDITOR });
    const profile = await makeProfile({ userId: staff._id });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/admin/members/${profile._id}/anonymize`)).status).toBe(409);
  });
});

describe('member export', () => {
  const seed = async () => {
    await makeProfile({ displayName: '=HYPERLINK("http://evil","click")', village: 'Unjha', phone: '+91 98250 00010', familySize: 4 });
    await makeProfile({ displayName: 'Normal Person', village: 'Kadi' });
  };

  it('is refused to roles without members.export, including Admin by default', async () => {
    await seed();
    for (const role of [Roles.VIEWER, Roles.EDITOR, Roles.ADMIN, Roles.MEMBER]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/members/export')).status).toBe(403);
    }
    expect((await anon().get('/api/admin/members/export')).status).toBe(401);
  });

  it('is available when members.export is granted individually, without private columns', async () => {
    await seed();
    const { client } = await signInAs(Roles.ADMIN, { extraPermissions: ['members.export'] });
    const res = await client.get('/api/admin/members/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="members-/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('Normal Person');
    expect(res.text).not.toMatch(/98250|Phone|Family size/);
  });

  it('includes private columns for Super Admin, neutralises spreadsheet formulas and is audited', async () => {
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
