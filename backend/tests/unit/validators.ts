import { describe, it, expect } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { ValidationChain } from 'express-validator';
import {
  changePasswordRules,
  forgotPasswordRules,
  loginRules,
  registerRules,
  resetPasswordRules,
  themeRules,
} from '../../src/validators/authValidator';
import {
  changeRoleRules,
  createStaffRules,
  listUsersRules,
  reasonRules,
  userIdRules,
} from '../../src/validators/userValidator';
import { contactIdRules, contactListRules, contactNoteRules, submitContactRules, updateContactRules } from '../../src/validators/contactValidator';
import {
  cancelEventRules,
  createEventRules,
  eventIdRules,
  publicEventListRules,
  registrationIdRules,
  registrationListRules,
  rsvpRules,
  updateEventRules,
} from '../../src/validators/eventValidator';
import {
  announcementIdRules,
  createAnnouncementRules,
  publicAnnouncementListRules,
  reorderRules,
  updateAnnouncementRules,
} from '../../src/validators/announcementValidator';
import {
  blockBodyRules,
  blockKeyRules,
  createItemRules,
  publicListRules,
  reorderItemRules,
  updateItemRules,
} from '../../src/validators/contentValidator';
import { mediaIdRules, mediaListRules, mediaUpdateRules } from '../../src/validators/mediaValidator';
import { createMemberRules, directoryQueryRules, memberIdRules, updateMemberRules, updateOwnProfileRules } from '../../src/validators/memberValidator';
import { auditListRules, searchRules, updateSettingsRules } from '../../src/validators/settingsValidator';
import { paginationRules } from '../../src/utils/pagination';
import { validateRequest } from '../../src/validators/validateRequest';
import { GRANTABLE_PERMISSIONS } from '../../src/config/permissions';

type Rules = (ValidationChain | RequestHandler)[];

/** Mounts a rule list on a throwaway app and reports what it let through. No database involved. */
const probe = (rules: Rules, pattern = '/t') => {
  const app = express();
  app.use(express.json());
  app.all(pattern, ...(rules as RequestHandler[]), (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  return request(app);
};

const fields = (res: request.Response) =>
  (res.body.error?.details ?? []).map((d: { field?: string }) => d.field).filter(Boolean) as string[];

const ID = '11111111-1111-4111-8111-111111111111';
const FUTURE = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('validateRequest', () => {
  it('passes when nothing failed', async () => {
    const res = await probe([validateRequest]).post('/t').send({});
    expect(res.status).toBe(200);
  });

  it('answers 400 in the standard shape and names each failing field', async () => {
    const res = await probe(loginRules).post('/t').send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Validation failed', error: { code: 'VALIDATION_ERROR' } });
    expect([...new Set(fields(res))].sort()).toEqual(['email', 'password']);
  });
});

describe('paginationRules', () => {
  it('accepts valid and absent values and rejects out-of-range ones', async () => {
    const app = probe([...paginationRules(20), validateRequest]);
    expect((await app.get('/t')).status).toBe(200);
    expect((await app.get('/t?page=2&limit=20')).status).toBe(200);
    for (const q of ['page=0', 'page=-1', 'page=abc', 'page=100001', 'limit=0', 'limit=21', 'limit=1.5']) {
      expect((await app.get(`/t?${q}`)).status, q).toBe(400);
    }
  });

  it('uses the cap it is given', async () => {
    const app = probe([...paginationRules(100), validateRequest]);
    expect((await app.get('/t?limit=100')).status).toBe(200);
    expect((await app.get('/t?limit=101')).status).toBe(400);
  });
});

describe('auth validators', () => {
  const register = {
    name: 'Asha Patel',
    email: 'asha@example.com',
    phone: '+91 98765 43210',
    password: 'Correct-Horse-9',
    confirmPassword: 'Correct-Horse-9',
    acknowledge: true,
  };

  describe('registerRules', () => {
    const app = () => probe(registerRules);

    it('accepts a complete registration, with or without a phone, and normalises the email', async () => {
      const ok = await app().post('/t').send({ ...register, email: ' Asha@Example.COM ' });
      expect(ok.status).toBe(200);
      expect(ok.body.body.email).toBe('asha@example.com');
      const { phone: _phone, ...noPhone } = register;
      expect((await app().post('/t').send(noPhone)).status).toBe(200);
    });

    it.each([
      ['a name with markup', { name: '<b>Asha</b>' }, 'name'],
      ['a one-letter name', { name: 'A' }, 'name'],
      ['a non-string name', { name: 123 }, 'name'],
      ['a bad email', { email: 'not-an-email' }, 'email'],
      ['an oversized email', { email: `${'a'.repeat(250)}@example.com` }, 'email'],
      ['a bad phone', { phone: 'call me' }, 'phone'],
      ['a weak password', { password: 'short1', confirmPassword: 'short1' }, 'password'],
      ['a common password', { password: 'Password123', confirmPassword: 'Password123' }, 'password'],
      ['a password containing the email name', { password: 'Asha-Secret-99', confirmPassword: 'Asha-Secret-99' }, 'password'],
      ['mismatched confirmation', { confirmPassword: 'Something-Else-1' }, 'confirmPassword'],
      ['no acknowledgement', { acknowledge: false }, 'acknowledge'],
      ['a string acknowledgement', { acknowledge: 'true' }, 'acknowledge'],
    ])('rejects %s', async (_label, over, field) => {
      const res = await app().post('/t').send({ ...register, ...over });
      expect(res.status).toBe(400);
      expect(fields(res)).toContain(field);
    });

    it('rejects an empty body', async () => {
      expect((await app().post('/t').send({})).status).toBe(400);
    });
  });

  describe('loginRules', () => {
    it('needs a non-empty email and password, and does not apply password strength rules', async () => {
      expect((await probe(loginRules).post('/t').send({ email: 'a@b.co', password: 'x' })).status).toBe(200);
      expect((await probe(loginRules).post('/t').send({ email: '', password: 'x' })).status).toBe(400);
      expect((await probe(loginRules).post('/t').send({ email: 'a@b.co', password: '' })).status).toBe(400);
      expect((await probe(loginRules).post('/t').send({ email: ['a@b.co'], password: 'x' })).status).toBe(400);
    });
  });

  describe('forgotPasswordRules', () => {
    it('needs a valid email', async () => {
      expect((await probe(forgotPasswordRules).post('/t').send({ email: 'a@example.com' })).status).toBe(200);
      expect((await probe(forgotPasswordRules).post('/t').send({ email: 'nope' })).status).toBe(400);
      expect((await probe(forgotPasswordRules).post('/t').send({})).status).toBe(400);
    });
  });

  describe('resetPasswordRules', () => {
    const body = { token: 't'.repeat(43), password: 'Fresh-Start-2026', confirmPassword: 'Fresh-Start-2026' };

    it('accepts a well-formed request', async () => {
      expect((await probe(resetPasswordRules).post('/t').send(body)).status).toBe(200);
    });

    it('rejects tokens that are too short, too long or not text', async () => {
      for (const token of ['short', 'x'.repeat(129), 1234567890123, undefined]) {
        const res = await probe(resetPasswordRules).post('/t').send({ ...body, token });
        expect(res.status, String(token)).toBe(400);
      }
    });

    it('rejects weak or mismatched passwords', async () => {
      expect((await probe(resetPasswordRules).post('/t').send({ ...body, password: 'weak', confirmPassword: 'weak' })).status).toBe(400);
      expect((await probe(resetPasswordRules).post('/t').send({ ...body, confirmPassword: 'Different-One-1' })).status).toBe(400);
    });
  });

  describe('changePasswordRules', () => {
    const body = { currentPassword: 'old', newPassword: 'Brand-New-Pass-42', confirmPassword: 'Brand-New-Pass-42' };

    it('accepts a valid change', async () => {
      expect((await probe(changePasswordRules).post('/t').send(body)).status).toBe(200);
    });

    it('needs the current password and a strong, confirmed new one', async () => {
      expect((await probe(changePasswordRules).post('/t').send({ ...body, currentPassword: '' })).status).toBe(400);
      expect((await probe(changePasswordRules).post('/t').send({ ...body, newPassword: 'weak', confirmPassword: 'weak' })).status).toBe(400);
      expect((await probe(changePasswordRules).post('/t').send({ ...body, confirmPassword: 'nope' })).status).toBe(400);
    });
  });

  describe('themeRules', () => {
    it('accepts system, light and dark only', async () => {
      for (const t of ['system', 'light', 'dark']) expect((await probe(themeRules).patch('/t').send({ themePreference: t })).status).toBe(200);
      for (const t of ['neon', '', null, 1]) expect((await probe(themeRules).patch('/t').send({ themePreference: t })).status).toBe(400);
    });
  });
});

describe('user validators', () => {
  it('requires a UUID for user ids', async () => {
    expect((await probe(userIdRules, '/t/:id').post(`/t/${ID}`)).status).toBe(200);
    expect((await probe(userIdRules, '/t/:id').post('/t/not-a-uuid')).status).toBe(400);
  });

  it('limits the user list filters', async () => {
    const app = probe(listUsersRules);
    expect((await app.get('/t?role=member&status=pending&search=asha&page=1&limit=100')).status).toBe(200);
    for (const q of ['role=hacker', 'status=gone', 'limit=101', 'page=0', `search=${'x'.repeat(101)}`]) {
      expect((await app.get(`/t?${q}`)).status, q).toBe(400);
    }
  });

  describe('createStaffRules', () => {
    const body = { name: 'New Editor', email: 'new@example.com', role: 'editor' };

    it.each(['admin', 'editor', 'viewer'])('allows creating a %s', async (role) => {
      expect((await probe(createStaffRules).post('/t').send({ ...body, role })).status).toBe(200);
    });

    it.each(['superadmin', 'member', 'root', ''])('refuses to create a %j', async (role) => {
      const res = await probe(createStaffRules).post('/t').send({ ...body, role });
      expect(res.status).toBe(400);
      expect(fields(res)).toContain('role');
    });

    it('validates name and email', async () => {
      expect((await probe(createStaffRules).post('/t').send({ ...body, name: '<x>' })).status).toBe(400);
      expect((await probe(createStaffRules).post('/t').send({ ...body, email: 'bad' })).status).toBe(400);
    });
  });

  describe('changeRoleRules', () => {
    const app = () => probe(changeRoleRules, '/t/:id');

    it('accepts known roles and grantable extras only', async () => {
      expect((await app().patch(`/t/${ID}`).send({ role: 'admin' })).status).toBe(200);
      expect((await app().patch(`/t/${ID}`).send({ role: 'editor', extraPermissions: [...GRANTABLE_PERMISSIONS] })).status).toBe(200);
      expect((await app().patch(`/t/${ID}`).send({ role: 'editor', extraPermissions: [] })).status).toBe(200);
    });

    it('rejects unknown roles, ungrantable permissions, oversize lists and bad ids', async () => {
      expect((await app().patch(`/t/${ID}`).send({ role: 'god' })).status).toBe(400);
      expect((await app().patch(`/t/${ID}`).send({ role: 'editor', extraPermissions: ['users.manage'] })).status).toBe(400);
      expect((await app().patch(`/t/${ID}`).send({ role: 'editor', extraPermissions: 'events.publish' })).status).toBe(400);
      expect((await app().patch(`/t/${ID}`).send({ role: 'editor', extraPermissions: Array(11).fill(GRANTABLE_PERMISSIONS[0]) })).status).toBe(400);
      expect((await app().patch('/t/nope').send({ role: 'editor' })).status).toBe(400);
    });
  });

  it('limits the optional reason to 500 characters', async () => {
    const app = probe(reasonRules, '/t/:id');
    expect((await app.post(`/t/${ID}`).send({})).status).toBe(200);
    expect((await app.post(`/t/${ID}`).send({ reason: 'x'.repeat(500) })).status).toBe(200);
    expect((await app.post(`/t/${ID}`).send({ reason: 'x'.repeat(501) })).status).toBe(400);
  });
});

describe('contact validators', () => {
  const body = { name: 'Asha Patel', email: 'asha@example.com', message: 'I would like to know more about membership.' };

  it('accepts a message, a listed topic and a filled honeypot (handled by the controller)', async () => {
    expect((await probe(submitContactRules).post('/t').send(body)).status).toBe(200);
    expect((await probe(submitContactRules).post('/t').send({ ...body, topic: 'Membership' })).status).toBe(200);
    expect((await probe(submitContactRules).post('/t').send({ ...body, website: 'http://spam.example' })).status).toBe(200);
  });

  it.each([
    ['an unlisted topic', { topic: 'Spam' }],
    ['a short message', { message: 'too short' }],
    ['a message over 4000 characters', { message: 'x'.repeat(4001) }],
    ['markup in the message', { message: 'Hello <script>alert(1)</script> there' }],
    ['markup in the name', { name: 'A<b>' }],
    ['a bad email', { email: 'x' }],
    ['an oversized honeypot', { website: 'x'.repeat(501) }],
  ])('rejects %s', async (_label, over) => {
    expect((await probe(submitContactRules).post('/t').send({ ...body, ...over })).status).toBe(400);
  });

  it('validates ids, list filters, updates and notes', async () => {
    expect((await probe(contactIdRules, '/t/:id').get('/t/nope')).status).toBe(400);
    expect((await probe(contactIdRules, '/t/:id').get(`/t/${ID}`)).status).toBe(200);

    const list = probe(contactListRules);
    expect((await list.get(`/t?status=new&assignedTo=${ID}&mine=true&limit=100`)).status).toBe(200);
    for (const q of ['status=bogus', 'assignedTo=x', 'mine=maybe', 'limit=101']) expect((await list.get(`/t?${q}`)).status, q).toBe(400);

    const update = probe(updateContactRules, '/t/:id');
    expect((await update.patch(`/t/${ID}`).send({ status: 'resolved', assignedTo: null })).status).toBe(200);
    expect((await update.patch(`/t/${ID}`).send({ status: 'nonsense' })).status).toBe(400);
    expect((await update.patch(`/t/${ID}`).send({ assignedTo: 'someone' })).status).toBe(400);

    const note = probe(contactNoteRules, '/t/:id');
    expect((await note.post(`/t/${ID}`).send({ text: 'Called back.' })).status).toBe(200);
    for (const text of ['', 'x'.repeat(1001), '<b>', 5]) expect((await note.post(`/t/${ID}`).send({ text })).status).toBe(400);
  });
});

describe('event validators', () => {
  const body = { title: 'Garba Night', venue: 'Samaj Bhavan', startsAt: FUTURE(10) };

  it('accepts a minimal and a full event', async () => {
    expect((await probe(createEventRules).post('/t').send(body)).status).toBe(200);
    const full = {
      ...body,
      description: 'An evening of garba.',
      category: 'Festival',
      endsAt: FUTURE(11),
      registrationOpensAt: FUTURE(1),
      registrationClosesAt: FUTURE(9),
      capacity: 100,
      featured: true,
      imageMediaId: ID,
    };
    expect((await probe(createEventRules).post('/t').send(full)).status).toBe(200);
  });

  it('turns date strings into dates and numeric strings into numbers', async () => {
    const inspect: RequestHandler = (req, res) => {
      res.json({ startsAt: req.body.startsAt instanceof Date, capacity: req.body.capacity });
    };
    const res = await probe([...createEventRules.slice(0, -1), inspect]).post('/t').send({ ...body, capacity: '25' });
    expect(res.body).toEqual({ startsAt: true, capacity: 25 });
  });

  it.each([
    ['no title', { title: undefined }, 'title'],
    ['a short title', { title: 'ab' }, 'title'],
    ['markup in the title', { title: '<b>Big</b>' }, 'title'],
    ['no venue', { venue: undefined }, 'venue'],
    ['no start time', { startsAt: undefined }, 'startsAt'],
    ['an invalid start time', { startsAt: 'tomorrow-ish' }, 'startsAt'],
    ['an unknown category', { category: 'Party' }, 'category'],
    ['a negative capacity', { capacity: -1 }, 'capacity'],
    ['a huge capacity', { capacity: 100001 }, 'capacity'],
    ['a non-UUID image', { imageMediaId: 'x' }, 'imageMediaId'],
  ])('rejects %s', async (_label, over, field) => {
    const res = await probe(createEventRules).post('/t').send({ ...body, ...over });
    expect(res.status).toBe(400);
    expect(fields(res)).toContain(field);
  });

  it('rejects inconsistent schedules', async () => {
    const bad = [
      { endsAt: FUTURE(9) }, // ends before it starts
      { registrationOpensAt: FUTURE(5), registrationClosesAt: FUTURE(5) },
      { registrationClosesAt: FUTURE(11) }, // closes after start
    ];
    for (const over of bad) expect((await probe(createEventRules).post('/t').send({ ...body, ...over })).status, JSON.stringify(over)).toBe(400);
  });

  it('allows partial updates, but still checks any field that is sent', async () => {
    const app = probe(updateEventRules, '/t/:id');
    expect((await app.patch(`/t/${ID}`).send({})).status).toBe(200);
    expect((await app.patch(`/t/${ID}`).send({ capacity: 0 })).status).toBe(200);
    expect((await app.patch(`/t/${ID}`).send({ title: '<b>x</b>' })).status).toBe(400);
    expect((await app.patch(`/t/${ID}`).send({ title: 'x'.repeat(151) })).status).toBe(400);
    expect((await app.patch('/t/not-an-id').send({ capacity: 1 })).status).toBe(400);
  });

  it('validates ids, filters, cancellation, RSVP and registration lists', async () => {
    expect((await probe(eventIdRules, '/t/:id').get('/t/x')).status).toBe(400);

    const list = probe(publicEventListRules);
    expect((await list.get('/t?when=upcoming&category=Seva&search=garba')).status).toBe(200);
    for (const q of ['when=sometime', 'category=Nope', 'limit=51']) expect((await list.get(`/t?${q}`)).status, q).toBe(400);

    const cancel = probe(cancelEventRules, '/t/:id');
    expect((await cancel.post(`/t/${ID}`).send({ reason: 'Rain' })).status).toBe(200);
    expect((await cancel.post(`/t/${ID}`).send({ reason: 'x'.repeat(501) })).status).toBe(400);

    const rsvp = probe(rsvpRules, '/t/:id');
    expect((await rsvp.post(`/t/${ID}`).send({})).status).toBe(200);
    expect((await rsvp.post(`/t/${ID}`).send({ attendees: 10 })).status).toBe(200);
    for (const attendees of [0, 11, 'many']) expect((await rsvp.post(`/t/${ID}`).send({ attendees })).status).toBe(400);

    const regs = probe(registrationListRules, '/t/:id');
    expect((await regs.get(`/t/${ID}?status=confirmed`)).status).toBe(200);
    expect((await regs.get(`/t/${ID}?status=pending`)).status).toBe(400);

    const regId = probe(registrationIdRules, '/t/:id/r/:registrationId');
    expect((await regId.delete(`/t/${ID}/r/${ID}`)).status).toBe(200);
    expect((await regId.delete(`/t/${ID}/r/nope`)).status).toBe(400);
  });
});

describe('announcement validators', () => {
  const body = { title: 'New hall timings', body: 'The hall opens at nine.' };

  it('accepts a minimal and a full announcement', async () => {
    expect((await probe(createAnnouncementRules).post('/t').send(body)).status).toBe(200);
    const full = { ...body, summary: 'Timings', category: 'Notice', publishAt: FUTURE(1), featured: true };
    expect((await probe(createAnnouncementRules).post('/t').send(full)).status).toBe(200);
  });

  it.each([
    ['a missing title', { title: undefined }],
    ['a short title', { title: 'ab' }],
    ['markup in the body', { body: '<script>x</script>' }],
    ['an empty body', { body: '' }],
    ['a body over 8000 characters', { body: 'x'.repeat(8001) }],
    ['a summary over 300 characters', { summary: 'x'.repeat(301) }],
    ['an unknown category', { category: 'Gossip' }],
    ['an invalid publishAt', { publishAt: 'next week' }],
  ])('rejects %s', async (_label, over) => {
    expect((await probe(createAnnouncementRules).post('/t').send({ ...body, ...over })).status).toBe(400);
  });

  it('allows partial updates and null publishAt', async () => {
    const app = probe(updateAnnouncementRules, '/t/:id');
    expect((await app.patch(`/t/${ID}`).send({})).status).toBe(200);
    expect((await app.patch(`/t/${ID}`).send({ publishAt: null })).status).toBe(200);
    expect((await app.patch(`/t/${ID}`).send({ title: '<b>x</b>' })).status).toBe(400);
  });

  it('validates ids, filters and reorder lists', async () => {
    expect((await probe(announcementIdRules, '/t/:id').get('/t/zzz')).status).toBe(400);
    const list = probe(publicAnnouncementListRules);
    expect((await list.get('/t?archived=true&category=Seva')).status).toBe(200);
    expect((await list.get('/t?archived=maybe')).status).toBe(400);

    const reorder = probe(reorderRules);
    expect((await reorder.patch('/t').send({ ids: [ID] })).status).toBe(200);
    for (const ids of [[], 'abc', ['nope'], [ID, 5], Array(201).fill(ID)]) {
      expect((await reorder.patch('/t').send({ ids })).status, JSON.stringify(ids).slice(0, 40)).toBe(400);
    }
  });
});

describe('content validators', () => {
  it('rejects unknown resource names before reading the body', async () => {
    expect((await probe(createItemRules, '/t/:resource').post('/t/passwords').send({})).status).toBe(400);
    expect((await probe(publicListRules, '/t/:resource').get('/t/users')).status).toBe(400);
    expect((await probe(publicListRules, '/t/:resource').get('/t/faqs')).status).toBe(200);
  });

  it('applies the rule set of the named resource', async () => {
    const create = probe(createItemRules, '/t/:resource');
    expect((await create.post('/t/faqs').send({ question: 'How do I join?', answer: 'Register on the site.' })).status).toBe(200);
    expect((await create.post('/t/faqs').send({ question: 'Hi', answer: 'x' })).status).toBe(400);
    expect((await create.post('/t/faqs').send({ question: 'How do I join?', answer: '<b>x</b>' })).status).toBe(400);
    // The FAQ rules do not apply to links.
    expect((await create.post('/t/links').send({ label: 'Membership form', url: 'https://example.com/form' })).status).toBe(200);
  });

  it('only accepts web addresses for links', async () => {
    const create = probe(createItemRules, '/t/:resource');
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com/a', 'https://user:pw@example.com', '//example.com', 'example']) {
      expect((await create.post('/t/links').send({ label: 'A link', url })).status, url).toBe(400);
    }
    expect((await create.post('/t/links').send({ label: 'A link', fileMediaId: ID })).status).toBe(200);
    expect((await create.post('/t/links').send({ label: 'A link', category: 'Nope' })).status).toBe(400);
  });

  it('checks milestone, term and member rules', async () => {
    const create = probe(createItemRules, '/t/:resource');
    expect((await create.post('/t/milestones').send({ periodLabel: '1990s', title: 'Founded', text: 'The society was founded.' })).status).toBe(200);
    expect((await create.post('/t/milestones').send({ periodLabel: '', title: 'Founded', text: 'x' })).status).toBe(400);
    expect((await create.post('/t/committee-terms').send({ label: '2024-26', startYear: 2024, endYear: 2026 })).status).toBe(200);
    expect((await create.post('/t/committee-terms').send({ label: '2024-26', startYear: 2026, endYear: 2024 })).status).toBe(400);
    expect((await create.post('/t/committee-terms').send({ label: 'x', startYear: 1800, endYear: 2000 })).status).toBe(400);
    expect((await create.post('/t/committee-members').send({ termId: ID, name: 'Ravi Patel', position: 'President' })).status).toBe(200);
    expect((await create.post('/t/committee-members').send({ termId: 'x', name: 'Ravi Patel', position: 'President' })).status).toBe(400);
  });

  it('allows partial updates and still checks the id', async () => {
    const update = probe(updateItemRules, '/t/:resource/:id');
    expect((await update.patch(`/t/faqs/${ID}`).send({})).status).toBe(200);
    expect((await update.patch(`/t/faqs/${ID}`).send({ question: '<b>abc</b>' })).status).toBe(400);
    expect((await update.patch('/t/faqs/nope').send({})).status).toBe(400);
    expect((await update.patch(`/t/nothing/${ID}`).send({})).status).toBe(400);
  });

  it('validates reorder lists', async () => {
    const reorder = probe(reorderItemRules, '/t/:resource');
    expect((await reorder.patch('/t/faqs').send({ ids: [ID] })).status).toBe(200);
    expect((await reorder.patch('/t/faqs').send({ ids: ['x'] })).status).toBe(400);
    expect((await reorder.patch('/t/faqs').send({ ids: [] })).status).toBe(400);
    expect((await reorder.patch('/t/bogus').send({ ids: [ID] })).status).toBe(400);
  });

  it('checks block keys and bodies', async () => {
    expect((await probe(blockKeyRules, '/t/:key').get('/t/about.mission')).status).toBe(200);
    expect((await probe(blockKeyRules, '/t/:key').get('/t/made.up')).status).toBe(400);

    const block = probe(blockBodyRules, '/t/:key');
    const ok = { title: 'Mission', body: 'Serve the community.', items: [{ title: 'One', text: 'First', value: '5', label: 'Things' }] };
    expect((await block.put('/t/about.mission').send(ok)).status).toBe(200);
    expect((await block.put('/t/about.mission').send({})).status).toBe(200);
    expect((await block.put('/t/about.mission').send({ body: '<img src=x>' })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: Array(21).fill({}) })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: [{ text: 'x'.repeat(601) }] })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: [{ imageMediaId: 'x' }] })).status).toBe(400);
    expect((await block.put('/t/unknown.key').send({})).status).toBe(400);
  });
});

describe('media validators', () => {
  it('validates ids, list filters and metadata updates', async () => {
    expect((await probe(mediaIdRules, '/t/:id').get('/t/nope')).status).toBe(400);
    expect((await probe(mediaIdRules, '/t/:id').get(`/t/${ID}`)).status).toBe(200);

    const list = probe(mediaListRules);
    expect((await list.get('/t?kind=image&search=logo&limit=100')).status).toBe(200);
    for (const q of ['kind=exe', 'limit=101', `search=${'x'.repeat(101)}`]) expect((await list.get(`/t?${q}`)).status, q).toBe(400);

    const update = probe(mediaUpdateRules, '/t/:id');
    expect((await update.patch(`/t/${ID}`).send({ altText: 'A logo', visibility: 'private' })).status).toBe(200);
    expect((await update.patch(`/t/${ID}`).send({ altText: null })).status).toBe(200);
    expect((await update.patch(`/t/${ID}`).send({ visibility: 'secret' })).status).toBe(400);
    expect((await update.patch(`/t/${ID}`).send({ altText: '<b>' })).status).toBe(400);
    expect((await update.patch(`/t/${ID}`).send({ altText: 'x'.repeat(201) })).status).toBe(400);
    expect((await update.patch('/t/nope').send({})).status).toBe(400);
  });
});

describe('member validators', () => {
  it('validates ids and directory queries', async () => {
    expect((await probe(memberIdRules, '/t/:id').get('/t/nope')).status).toBe(400);
    const dir = probe(directoryQueryRules);
    expect((await dir.get('/t?search=patel&village=Unjha&city=Kadi&country=India&sort=-name&limit=50')).status).toBe(200);
    for (const q of ['sort=password', 'limit=51', `village=${'x'.repeat(81)}`, 'page=0']) expect((await dir.get(`/t?${q}`)).status, q).toBe(400);
  });

  describe('own profile', () => {
    const app = () => probe(updateOwnProfileRules);

    it('accepts valid details and converts the family size to a number', async () => {
      const res = await app().patch('/t').send({ village: 'Unjha', familySize: '5', phone: '+91 98765 43210', visibility: 'members', bio: 'Hello' });
      expect(res.status).toBe(200);
      expect(res.body.body.familySize).toBe(5);
    });

    it.each([
      ['family size 0', { familySize: 0 }],
      ['family size 41', { familySize: 41 }],
      ['a bad phone', { phone: 'abc' }],
      ['an unknown visibility', { visibility: 'everyone' }],
      ['a bio over 500 characters', { bio: 'x'.repeat(501) }],
      ['markup in the village', { village: '<b>x</b>' }],
      ['a non-text city', { city: 5 }],
    ])('rejects %s', async (_label, body) => {
      expect((await app().patch('/t').send(body)).status).toBe(400);
    });

    it('allows null to clear optional text', async () => {
      expect((await app().patch('/t').send({ village: null, familySize: null })).status).toBe(200);
    });
  });

  it('validates staff-created and staff-edited entries', async () => {
    const create = probe(createMemberRules);
    expect((await create.post('/t').send({ displayName: 'Asha Patel', joinedYear: 2010, membershipStatus: 'inactive', highlighted: true })).status).toBe(200);
    for (const body of [
      {},
      { displayName: 'A' },
      { displayName: '<b>x</b>' },
      { displayName: 'Asha', joinedYear: 1800 },
      { displayName: 'Asha', membershipStatus: 'pending' },
      { displayName: 'Asha', highlighted: 'sometimes' },
    ]) {
      expect((await create.post('/t').send(body)).status, JSON.stringify(body)).toBe(400);
    }

    const update = probe(updateMemberRules, '/t/:id');
    expect((await update.patch(`/t/${ID}`).send({})).status).toBe(200);
    expect((await update.patch(`/t/${ID}`).send({ displayName: 'A' })).status).toBe(400);
    expect((await update.patch('/t/nope').send({})).status).toBe(400);
  });
});

describe('settings validators', () => {
  const update = () => probe(updateSettingsRules);

  it('accepts a full valid update', async () => {
    const res = await update().patch('/t').send({
      name: 'Samaj',
      shortName: 'S',
      invocation: 'Jai',
      tagline: 'Together',
      footerNote: 'Footer',
      contact: { email: 'office@example.com', phone: '+91 1', address: 'Unjha', officeHours: '9-5' },
      socialLinks: [{ label: 'Facebook', url: 'https://facebook.com/samaj' }],
      registrationOpen: 'false',
      directoryPublic: true,
      themeDefault: 'dark',
    });
    expect(res.status).toBe(200);
    expect(res.body.body.registrationOpen).toBe(false);
  });

  it.each([
    ['markup in the name', { name: '<b>x</b>' }],
    ['a name over 150 characters', { name: 'x'.repeat(151) }],
    ['a bad contact email', { contact: { email: 'nope' } }],
    ['a non-object contact', { contact: 'nope' }],
    ['nine social links', { socialLinks: Array(9).fill({ label: 'L', url: 'https://example.com' }) }],
    ['a javascript: social link', { socialLinks: [{ label: 'L', url: 'javascript:alert(1)' }] }],
    ['a social link with credentials', { socialLinks: [{ label: 'L', url: 'https://u:p@example.com' }] }],
    ['a social link with no label', { socialLinks: [{ label: '', url: 'https://example.com' }] }],
    ['a non-boolean switch', { registrationOpen: 'maybe' }],
    ['an unknown theme', { themeDefault: 'neon' }],
    ['a non-UUID logo', { logoMediaId: 'logo.png' }],
  ])('rejects %s', async (_label, body) => {
    expect((await update().patch('/t').send(body)).status).toBe(400);
  });

  it('accepts an empty body, null text fields and a cleared contact email', async () => {
    expect((await update().patch('/t').send({})).status).toBe(200);
    expect((await update().patch('/t').send({ tagline: null, logoMediaId: null, contact: { email: '' } })).status).toBe(200);
  });

  it('validates audit filters', async () => {
    const audit = probe(auditListRules);
    expect((await audit.get(`/t?action=announcement.*&actorId=${ID}&outcome=failure&targetType=user&from=2026-01-01&to=2026-12-31T00:00:00Z`)).status).toBe(200);
    for (const q of ['actorId=x', 'outcome=maybe', 'from=yesterday', 'to=2026-13-45', 'action=a%20b', 'action=a%24', 'targetType=a%20b', 'limit=101']) {
      expect((await audit.get(`/t?${q}`)).status, q).toBe(400);
    }
  });

  it('validates search text', async () => {
    const search = probe(searchRules);
    expect((await search.get('/t?q=diwali')).status).toBe(200);
    for (const q of ['', 'q=', 'q=a', `q=${'x'.repeat(101)}`]) expect((await search.get(`/t?${q}`)).status, q).toBe(400);
  });
});
