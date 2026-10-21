import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import ContactMessage from '../../src/models/ContactMessage';
import { AccountStatus, Roles } from '../../src/config/constants';
import { ORIGIN, anon, connectTestDb, disconnectTestDb, makeUser, resetDb, signInAs } from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const valid = (over: Record<string, unknown> = {}) => ({
  name: 'Meera Patel',
  email: 'meera@example.test',
  topic: 'Membership',
  message: 'I would like to know how to renew my family membership.',
  ...over,
});
const submit = (body: Record<string, unknown>) => anon().post('/api/contact').set('Origin', ORIGIN).send(body);

describe('public contact form', () => {
  it('saves the message and says it was received — never that an email was sent', async () => {
    const res = await submit(valid());
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/received by the Samaj office/i);
    expect(res.body.message).toMatch(/do not send an automatic confirmation/i);
    expect(res.body.message).not.toMatch(/email(ed)? (has been )?sent|we have emailed/i);
    expect(res.body.data.reference).toMatch(/^[0-9A-F]{8}$/);

    const stored = await ContactMessage.findOne().lean();
    expect(stored).toMatchObject({ name: 'Meera Patel', email: 'meera@example.test', topic: 'Membership', status: 'new' });
  });

  it('defaults the topic and stores a hash of the sender’s network address, not the address', async () => {
    await submit(valid({ topic: undefined }));
    const stored = await ContactMessage.findOne().lean();
    expect(stored?.topic).toBe('General enquiry');
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(stored)).not.toMatch(/127\.0\.0\.1|::1/);
  });

  it('does not echo the sender’s details back or expose internal fields', async () => {
    const res = await submit(valid());
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('meera@example.test');
    expect(body).not.toMatch(/ipHash|status|assignedTo/);
  });

  it.each([
    ['a missing name', { name: undefined }, 'name'],
    ['a one-letter name', { name: 'M' }, 'name'],
    ['markup in the name', { name: '<b>Meera</b>' }, 'name'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['an unknown topic', { topic: 'Free money' }, 'topic'],
    ['a too-short message', { message: 'Hi' }, 'message'],
    ['markup in the message', { message: 'Hello <script>alert(1)</script> there' }, 'message'],
    ['an over-long message', { message: 'x'.repeat(4001) }, 'message'],
  ])('rejects %s with a field-level 400', async (_label, patch, field) => {
    const res = await submit(valid(patch));
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await ContactMessage.countDocuments()).toBe(0);
  });

  it('rejects operator objects in fields', async () => {
    expect((await submit(valid({ email: { $ne: null } }))).status).toBe(400);
    expect((await submit(valid({ message: { $gt: '' } }))).status).toBe(400);
    expect(await ContactMessage.countDocuments()).toBe(0);
  });

  it('quietly discards submissions that fill the hidden honeypot field', async () => {
    const res = await submit(valid({ website: 'http://spam.example' }));
    expect(res.status).toBe(201); // the bot is told nothing useful
    expect(res.body.data).toEqual({});
    expect(await ContactMessage.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'contact.spam_blocked' })).toBe(1);
  });

  it('ignores an empty honeypot', async () => {
    expect((await submit(valid({ website: '' }))).status).toBe(201);
    expect(await ContactMessage.countDocuments()).toBe(1);
  });

  it('limits how often one email can write within an hour', async () => {
    for (let i = 0; i < 3; i += 1) expect((await submit(valid())).status).toBe(201);
    const fourth = await submit(valid());
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('RATE_LIMITED');
    expect(await ContactMessage.countDocuments()).toBe(3);

    // An older message does not count against the hourly cap.
    await ContactMessage.updateMany({}, { $set: { createdAt: new Date(Date.now() - 2 * 3600_000) } }, { timestamps: false, overwriteImmutable: true });
    expect((await submit(valid())).status).toBe(201);
  });

  it('also limits one network address across different emails', async () => {
    for (let i = 0; i < 6; i += 1) expect((await submit(valid({ email: `sender${i}@example.test` }))).status).toBe(201);
    expect((await submit(valid({ email: 'sender99@example.test' }))).status).toBe(429);
  });

  it('refuses submissions from another origin', async () => {
    const res = await anon().post('/api/contact').set('Origin', 'https://evil.example').send(valid());
    expect(res.status).toBe(403);
    expect(await ContactMessage.countDocuments()).toBe(0);
  });
});

describe('who can read the inbox', () => {
  it('is closed to visitors, members, viewers and editors', async () => {
    const message = await ContactMessage.create(valid());
    expect((await anon().get('/api/admin/contacts')).status).toBe(401);
    expect((await anon().get(`/api/admin/contacts/${message._id}`)).status).toBe(401);
    for (const role of [Roles.MEMBER, Roles.VIEWER, Roles.EDITOR]) {
      const { client } = await signInAs(role);
      const results = await Promise.all([
        client.get('/api/admin/contacts'),
        client.get(`/api/admin/contacts/${message._id}`),
        client.patch(`/api/admin/contacts/${message._id}`).send({ status: 'resolved' }),
        client.post(`/api/admin/contacts/${message._id}/notes`).send({ text: 'nope' }),
      ]);
      for (const res of results) expect(res.status, role).toBe(403);
    }
    expect((await ContactMessage.findById(message._id).lean())?.status).toBe('new');
  });

  it('lets Admin and Super Admin read it', async () => {
    await ContactMessage.create(valid());
    for (const role of [Roles.ADMIN, Roles.SUPER_ADMIN]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/contacts')).body.data.totalCount).toBe(1);
    }
  });
});

describe('inbox management', () => {
  const seed = async () => {
    await ContactMessage.create(valid({ name: 'Alice Shah', message: 'Question about scholarships for my daughter.', topic: 'Scholarships' }));
    await ContactMessage.create(valid({ name: 'Bhavin Mehta', message: 'Booking the Bhavan hall for a wedding.', topic: 'Patidar Samaj Bhavan booking', status: 'in_progress' }));
    await ContactMessage.create(valid({ name: 'Chetna Desai', message: 'Thanks, my membership is sorted now.', status: 'resolved' }));
  };

  it('lists with status counts, filters, search and paging', async () => {
    await seed();
    const { client } = await signInAs(Roles.ADMIN);
    const all = await client.get('/api/admin/contacts');
    expect(all.body.data.totalCount).toBe(3);
    expect(all.body.data.counts).toEqual({ new: 1, in_progress: 1, resolved: 1 });
    expect(all.body.data.messages[0]).toHaveProperty('preview');
    expect(all.body.data.messages[0]).not.toHaveProperty('notes');

    expect((await client.get('/api/admin/contacts?status=new')).body.data.messages[0].name).toBe('Alice Shah');
    expect((await client.get('/api/admin/contacts?search=wedding')).body.data.messages[0].name).toBe('Bhavin Mehta');
    expect((await client.get('/api/admin/contacts?search=.*')).body.data.totalCount).toBe(0);
    expect((await client.get('/api/admin/contacts?limit=2&page=2')).body.data.messages).toHaveLength(1);
    expect((await client.get('/api/admin/contacts?status=bogus')).status).toBe(400);
  });

  it('shows the full message on the detail view and records that it was opened', async () => {
    const message = await ContactMessage.create(valid());
    const { user, client } = await signInAs(Roles.ADMIN);
    expect((await client.get('/api/admin/contacts')).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'contact.viewed' })).toBe(0); // listing is not a "view"

    const res = await client.get(`/api/admin/contacts/${message._id}`);
    expect(res.body.data.message).toMatchObject({ email: 'meera@example.test', message: valid().message, notes: [] });
    const audit = await AuditLog.findOne({ action: 'contact.viewed' }).lean();
    expect(audit).toMatchObject({ actorId: user._id, targetId: message._id });
    expect((await client.get('/api/admin/contacts/11111111-1111-4111-8111-111111111111')).status).toBe(404);
    expect((await client.get('/api/admin/contacts/nope')).status).toBe(400);
  });

  it('moves a message through New → In Progress → Resolved and back, auditing each change', async () => {
    const message = await ContactMessage.create(valid());
    const { client } = await signInAs(Roles.ADMIN);
    const set = (status: string) => client.patch(`/api/admin/contacts/${message._id}`).send({ status });

    expect((await set('in_progress')).body.data.message.status).toBe('in_progress');
    const resolved = await set('resolved');
    expect(resolved.body.data.message.status).toBe('resolved');
    expect(resolved.body.data.message.resolvedAt).toBeTruthy();
    const reopened = await set('new');
    expect(reopened.body.data.message.resolvedAt).toBeNull();
    expect((await set('archived')).status).toBe(400);
    expect(await AuditLog.countDocuments({ action: 'contact.updated', targetId: message._id })).toBe(3);
  });

  it('assigns to active staff only, and moves a new message into progress', async () => {
    const message = await ContactMessage.create(valid());
    const staff = await makeUser({ role: Roles.EDITOR });
    const member = await makeUser({ role: Roles.MEMBER });
    const suspended = await makeUser({ role: Roles.ADMIN, status: AccountStatus.SUSPENDED });
    const { client } = await signInAs(Roles.ADMIN);
    const assign = (id: string | null) => client.patch(`/api/admin/contacts/${message._id}`).send({ assignedTo: id });

    expect((await assign(member._id)).status).toBe(400);
    expect((await assign(suspended._id)).status).toBe(400);
    expect((await assign('11111111-1111-4111-8111-111111111111')).status).toBe(400);
    expect((await assign('not-an-id')).status).toBe(400);
    expect((await ContactMessage.findById(message._id).lean())?.assignedTo).toBeNull();

    const ok = await assign(staff._id);
    expect(ok.status).toBe(200);
    expect(ok.body.data.message).toMatchObject({ assignedTo: staff._id, status: 'in_progress' });
    expect((await client.get(`/api/admin/contacts?assignedTo=${staff._id}`)).body.data.totalCount).toBe(1);

    const cleared = await assign(null);
    expect(cleared.body.data.message.assignedTo).toBeNull();
  });

  it('filters to the signed-in staff member’s own messages', async () => {
    const { user, client } = await signInAs(Roles.ADMIN);
    await ContactMessage.create(valid({ assignedTo: user._id }));
    await ContactMessage.create(valid({ email: 'other@example.test' }));
    expect((await client.get('/api/admin/contacts?mine=true')).body.data.totalCount).toBe(1);
  });

  it('keeps internal notes on the detail view only', async () => {
    const message = await ContactMessage.create(valid());
    const { user, client } = await signInAs(Roles.ADMIN);
    const res = await client.post(`/api/admin/contacts/${message._id}/notes`).send({ text: 'Called back; will send the form.' });
    expect(res.status).toBe(201);
    expect(res.body.data.message.notes[0]).toMatchObject({ authorId: user._id, text: 'Called back; will send the form.' });
    expect((await client.get('/api/admin/contacts')).body.data.messages[0]).not.toHaveProperty('notes');
    expect((await client.post(`/api/admin/contacts/${message._id}/notes`).send({ text: '' })).status).toBe(400);
    expect((await client.post(`/api/admin/contacts/${message._id}/notes`).send({ text: '<script>x</script>' })).status).toBe(400);
    expect(await AuditLog.countDocuments({ action: 'contact.note_added' })).toBe(1);
  });

  it('ignores fields staff may not change (sender details, hash, deletion flag)', async () => {
    const message = await ContactMessage.create(valid());
    const { client } = await signInAs(Roles.ADMIN);
    await client.patch(`/api/admin/contacts/${message._id}`).send({ status: 'in_progress', email: 'changed@example.test', name: 'Changed', message: 'Changed', isDeleted: true, ipHash: 'x' });
    const stored = await ContactMessage.findById(message._id).lean();
    expect(stored).toMatchObject({ email: 'meera@example.test', name: 'Meera Patel', isDeleted: false, status: 'in_progress' });
    expect(stored?.message).toBe(valid().message);
  });
});
