import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import CommitteeMember from '../../src/models/CommitteeMember';
import CommitteeTerm from '../../src/models/CommitteeTerm';
import ContentBlock from '../../src/models/ContentBlock';
import Faq from '../../src/models/Faq';
import ImportantLink from '../../src/models/ImportantLink';
import MediaAsset from '../../src/models/MediaAsset';
import { Roles } from '../../src/config/constants';
import { anon, connectTestDb, disconnectTestDb, resetDb, signInAs, READ_ONLY_ADMIN_PERMISSIONS,
  DRAFT_ADMIN_PERMISSIONS,
  OPS_ADMIN_PERMISSIONS } from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const asset = (kind: 'image' | 'document' = 'image') =>
  MediaAsset.create({
    storedName: `${Math.random().toString(36).slice(2)}.${kind === 'image' ? 'jpg' : 'pdf'}`,
    originalName: 'file',
    mimeType: kind === 'image' ? 'image/jpeg' : 'application/pdf',
    size: 100,
    kind,
  });

describe('public content', () => {
  it('shows only published FAQs, in display order, with no internal fields', async () => {
    await Faq.create({ question: 'Second question?', answer: 'A2', status: 'published', order: 2 });
    await Faq.create({ question: 'First question?', answer: 'A1', status: 'published', order: 1 });
    await Faq.create({ question: 'Draft question?', answer: 'x', status: 'draft' });
    await Faq.create({ question: 'Archived question?', answer: 'x', status: 'archived' });
    await Faq.create({ question: 'Deleted question?', answer: 'x', status: 'published', isDeleted: true });

    const res = await anon().get('/api/content/faqs');
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i: { question: string }) => i.question)).toEqual(['First question?', 'Second question?']);
    expect(res.body.data.totalCount).toBe(2);
    for (const key of ['status', 'order', 'createdBy', 'isDeleted', '_id']) expect(res.body.data.items[0]).not.toHaveProperty(key);
  });

  it('serves links, milestones and rejects unknown content types', async () => {
    await ImportantLink.create({ label: 'Membership form', url: 'https://example.org/form.pdf', category: 'Forms', status: 'published' });
    await ImportantLink.create({ label: 'Hidden draft', url: 'https://example.org/x', status: 'draft' });
    const links = await anon().get('/api/content/links');
    expect(links.body.data.items).toHaveLength(1);
    expect(links.body.data.items[0]).toMatchObject({ label: 'Membership form', category: 'Forms' });
    expect((await anon().get('/api/content/links?category=Forms')).body.data.totalCount).toBe(1);
    expect((await anon().get('/api/content/links?category=Documents')).body.data.totalCount).toBe(0);
    expect((await anon().get('/api/content/passwords')).status).toBe(400);
    expect((await anon().get('/api/content/users')).status).toBe(400);
  });

  it('assembles the Committee page from the current term without hard-coding a period', async () => {
    const old = await CommitteeTerm.create({ label: '2022–2024', startYear: 2022, endYear: 2024, status: 'published' });
    const current = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027, isCurrent: true, status: 'published' });
    await CommitteeTerm.create({ label: '2028–2030', startYear: 2028, endYear: 2030, status: 'draft' });
    await CommitteeMember.create({ termId: current._id, name: 'Ashok Patel', position: 'President', order: 1, status: 'published' });
    await CommitteeMember.create({ termId: current._id, name: 'Draft Person', position: 'Treasurer', order: 2, status: 'draft' });
    await CommitteeMember.create({ termId: old._id, name: 'Old Member', position: 'Secretary', status: 'published' });

    const res = await anon().get('/api/content/committee');
    expect(res.body.data.term).toMatchObject({ label: '2025–2027', isCurrent: true });
    expect(res.body.data.terms.map((t: { label: string }) => t.label)).toEqual(['2025–2027', '2022–2024']);
    expect(res.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Ashok Patel']);

    const past = await anon().get(`/api/content/committee?termId=${old._id}`);
    expect(past.body.data.members.map((m: { name: string }) => m.name)).toEqual(['Old Member']);
  });

  it('falls back to the most recent term when none is flagged current, and copes with none at all', async () => {
    expect((await anon().get('/api/content/committee')).body.data).toMatchObject({ term: null, members: [], terms: [] });
    await CommitteeTerm.create({ label: '2019–2021', startYear: 2019, endYear: 2021, status: 'published' });
    await CommitteeTerm.create({ label: '2022–2024', startYear: 2022, endYear: 2024, status: 'published' });
    expect((await anon().get('/api/content/committee')).body.data.term.label).toBe('2022–2024');
  });

  it('serves only published text blocks', async () => {
    await ContentBlock.create({ key: 'about.mission', title: 'Mission', body: 'Keep families connected.', status: 'published' });
    await ContentBlock.create({ key: 'about.vision', title: 'Vision', body: 'Not yet.', status: 'draft' });
    const all = await anon().get('/api/content/blocks');
    expect(Object.keys(all.body.data.blocks)).toEqual(['about.mission']);
    expect((await anon().get('/api/content/blocks/about.mission')).body.data.block.body).toBe('Keep families connected.');
    expect((await anon().get('/api/content/blocks/about.vision')).status).toBe(404);
    expect((await anon().get('/api/content/blocks/made.up')).status).toBe(400);
  });
});

describe('content management permissions', () => {
  it('keeps admin content endpoints closed to visitors and members', async () => {
    expect((await anon().get('/api/admin/content/faqs')).status).toBe(401);
    const { client } = await signInAs(Roles.ADMIN, { permissions: [] });
    for (const res of await Promise.all([
      client.get('/api/admin/content/faqs'),
      client.post('/api/admin/content/faqs').send({ question: 'Sneaky question?', answer: 'x' }),
      client.get('/api/admin/content/blocks'),
      client.put('/api/admin/content/blocks/about.mission').send({ body: 'x' }),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('gives Viewers read-only access', async () => {
    const faq = await Faq.create({ question: 'A draft question?', answer: 'Answer' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: READ_ONLY_ADMIN_PERMISSIONS });
    expect((await client.get('/api/admin/content/faqs')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/content/blocks')).status).toBe(200);
    for (const res of await Promise.all([
      client.post('/api/admin/content/faqs').send({ question: 'New question?', answer: 'x' }),
      client.patch(`/api/admin/content/faqs/${faq._id}`).send({ answer: 'changed' }),
      client.post(`/api/admin/content/faqs/${faq._id}/publish`),
      client.del(`/api/admin/content/faqs/${faq._id}`),
      client.put('/api/admin/content/blocks/about.mission').send({ body: 'x' }),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('lets Editors draft and edit drafts, but not publish, reorder, delete or touch live content', async () => {
    const live = await Faq.create({ question: 'A live question?', answer: 'Live answer', status: 'published' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });

    const created = await client.post('/api/admin/content/faqs').send({ question: 'Editor question?', answer: 'Draft answer', status: 'published', order: -9 });
    expect(created.status).toBe(201);
    expect(created.body.data.item.status).toBe('draft');
    const id = created.body.data.item.id as string;
    expect((await client.patch(`/api/admin/content/faqs/${id}`).send({ answer: 'Better answer' })).status).toBe(200);

    expect((await client.patch(`/api/admin/content/faqs/${live._id}`).send({ answer: 'Hijacked' })).status).toBe(403);
    expect((await client.post(`/api/admin/content/faqs/${id}/publish`)).status).toBe(403);
    expect((await client.del(`/api/admin/content/faqs/${id}`)).status).toBe(403);
    expect((await client.patch('/api/admin/content/faqs/reorder').send({ ids: [id] })).status).toBe(403);
    expect((await Faq.findById(live._id).lean())?.answer).toBe('Live answer');
    expect((await anon().get('/api/content/faqs')).body.data.totalCount).toBe(1);
  });

  it('applies the same draft-only rule to text blocks', async () => {
    await ContentBlock.create({ key: 'about.mission', body: 'Live text', status: 'published' });
    const { client: editor } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });
    expect((await editor.put('/api/admin/content/blocks/about.mission').send({ body: 'Hijacked' })).status).toBe(403);
    expect((await editor.put('/api/admin/content/blocks/about.vision').send({ title: 'Vision', body: 'Draft vision' })).status).toBe(200);
    expect((await editor.post('/api/admin/content/blocks/about.vision/publish')).status).toBe(403);
    expect((await ContentBlock.findOne({ key: 'about.mission' }).lean())?.body).toBe('Live text');

    const { client: admin } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await admin.put('/api/admin/content/blocks/about.mission').send({ body: 'Updated by admin' })).status).toBe(200);
    expect((await anon().get('/api/content/blocks/about.mission')).body.data.block.body).toBe('Updated by admin');
  });
});

describe('content lifecycle (Admin)', () => {
  it('creates a draft at the end of the list, publishes it, reorders and unpublishes', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const ids: string[] = [];
    for (const q of ['First question?', 'Second question?', 'Third question?']) {
      const r = await client.post('/api/admin/content/faqs').send({ question: q, answer: 'Answer' });
      expect(r.status).toBe(201);
      ids.push(r.body.data.item.id);
    }
    expect((await anon().get('/api/content/faqs')).body.data.totalCount).toBe(0); // all drafts
    for (const id of ids) expect((await client.post(`/api/admin/content/faqs/${id}/publish`)).status).toBe(200);
    expect((await anon().get('/api/content/faqs')).body.data.items.map((i: { question: string }) => i.question)).toEqual([
      'First question?',
      'Second question?',
      'Third question?',
    ]);

    const reordered = await client.patch('/api/admin/content/faqs/reorder').send({ ids: [ids[2], ids[0], ids[1]] });
    expect(reordered.status).toBe(200);
    expect((await anon().get('/api/content/faqs')).body.data.items[0].question).toBe('Third question?');

    expect((await client.post(`/api/admin/content/faqs/${ids[0]}/unpublish`)).status).toBe(200);
    expect((await anon().get('/api/content/faqs')).body.data.totalCount).toBe(2);
    expect((await client.post(`/api/admin/content/faqs/${ids[1]}/archive`)).status).toBe(200);
    expect((await anon().get('/api/content/faqs')).body.data.totalCount).toBe(1);
    expect((await client.post(`/api/admin/content/faqs/${ids[1]}/archive`)).status).toBe(409);

    const actions = (await AuditLog.find({ targetType: 'faqs' }).lean()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['content.faqs.created', 'content.faqs.published', 'content.faqs.unpublished', 'content.faqs.archived']));
  });

  it('soft-deletes and hides an item', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const faq = await Faq.create({ question: 'To be deleted?', answer: 'x', status: 'published' });
    expect((await client.del(`/api/admin/content/faqs/${faq._id}`)).status).toBe(200);
    expect((await Faq.findById(faq._id).lean())?.isDeleted).toBe(true);
    expect((await anon().get('/api/content/faqs')).body.data.totalCount).toBe(0);
    expect((await client.get(`/api/admin/content/faqs/${faq._id}`)).status).toBe(404);
  });

  it('filters and searches the staff list', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    await Faq.create({ question: 'How do I register?', answer: 'Log in first', status: 'published' });
    await Faq.create({ question: 'Who can join?', answer: 'Any family', status: 'draft' });
    expect((await client.get('/api/admin/content/faqs?status=draft')).body.data.items[0].question).toBe('Who can join?');
    expect((await client.get('/api/admin/content/faqs?search=log%20in')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/content/faqs?search=.*')).body.data.totalCount).toBe(0);
    expect((await client.get('/api/admin/content/faqs?limit=999')).status).toBe(400);
    expect((await client.get('/api/admin/content/nothing')).status).toBe(400);
  });

  it('accepts only the fields that belong to each content type', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const r = await client.post('/api/admin/content/faqs').send({ question: 'Real question?', answer: 'Real', url: 'https://evil.example', isDeleted: true, createdBy: 'x', _id: 'x' });
    expect(r.status).toBe(201);
    const stored = await Faq.findById(r.body.data.item.id).lean();
    expect(stored).not.toHaveProperty('url');
    expect(stored?.isDeleted).toBe(false);
  });

  it('validates text: plain only, with lengths', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    for (const body of [
      { question: 'Hi', answer: 'x' },
      { question: 'A proper question?', answer: '' },
      { question: '<img src=x onerror=alert(1)>', answer: 'x' },
      { question: 'A proper question?', answer: '<script>x</script>' },
      { question: 'A proper question?', answer: 'x'.repeat(2001) },
      { question: { $gt: '' }, answer: 'x' },
    ]) {
      expect((await client.post('/api/admin/content/faqs').send(body)).status).toBe(400);
    }
    expect(await Faq.countDocuments()).toBe(0);
  });
});

describe('important links', () => {
  it('accepts http(s) addresses and rejects unsafe or malformed ones', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const post = (url: string) => client.post('/api/admin/content/links').send({ label: 'A link here', url, category: 'Forms' });
    expect((await post('https://example.org/form.pdf')).status).toBe(201);
    expect((await post('http://example.org/page?x=1')).status).toBe(201);
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.org/x',
      'vbscript:msgbox(1)',
      '//example.org/x',
      'example.org/no-protocol',
      'https://user:pass@example.org/x',
      'https://',
      'not a url',
    ]) {
      expect((await post(bad)).status, `should reject ${bad}`).toBe(400);
    }
    expect(await ImportantLink.countDocuments()).toBe(2);
  });

  it('requires a web address or a document, but not both, and checks the document exists', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.post('/api/admin/content/links').send({ label: 'Nothing here' })).status).toBe(400);
    const pdf = await asset('document');
    const img = await asset('image');
    const ok = await client.post('/api/admin/content/links').send({ label: 'PDF download', fileMediaId: pdf._id });
    expect(ok.status).toBe(201);
    expect((await client.post('/api/admin/content/links').send({ label: 'Both given', url: 'https://example.org', fileMediaId: pdf._id })).status).toBe(400);
    expect((await client.post('/api/admin/content/links').send({ label: 'Image as doc', fileMediaId: img._id })).status).toBe(400);
    expect((await client.post('/api/admin/content/links').send({ label: 'Missing doc', fileMediaId: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
  });

  it('checks the URL again when an update changes it', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const link = await ImportantLink.create({ label: 'Existing link', url: 'https://example.org' });
    expect((await client.patch(`/api/admin/content/links/${link._id}`).send({ url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await ImportantLink.findById(link._id).lean())?.url).toBe('https://example.org');
  });
});

describe('committee management', () => {
  it('creates terms and members, keeping exactly one current term', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const a = await client.post('/api/admin/content/committee-terms').send({ label: '2022–2024', startYear: 2022, endYear: 2024, isCurrent: true });
    const b = await client.post('/api/admin/content/committee-terms').send({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    await client.post(`/api/admin/content/committee-terms/${a.body.data.item.id}/publish`);
    await client.post(`/api/admin/content/committee-terms/${b.body.data.item.id}/publish`);

    expect((await client.patch(`/api/admin/content/committee-terms/${b.body.data.item.id}`).send({ isCurrent: true })).status).toBe(200);
    const flags = (await CommitteeTerm.find().lean()).map((t) => [t.label, t.isCurrent]);
    expect(Object.fromEntries(flags)).toEqual({ '2022–2024': false, '2025–2027': true });
    expect((await anon().get('/api/content/committee')).body.data.term.label).toBe('2025–2027');
  });

  it('validates years and requires an existing term for a member', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.post('/api/admin/content/committee-terms').send({ label: 'Bad', startYear: 2027, endYear: 2025 })).status).toBe(400);
    expect((await client.post('/api/admin/content/committee-terms').send({ label: 'Bad', startYear: 1500, endYear: 1600 })).status).toBe(400);
    expect((await client.post('/api/admin/content/committee-members').send({ termId: '11111111-1111-4111-8111-111111111111', name: 'Orphan', position: 'Chair' })).status).toBe(400);
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    expect((await client.post('/api/admin/content/committee-members').send({ termId: term._id, name: 'Real Person', position: 'Chair' })).status).toBe(201);
  });

  it('checks that a member’s picture is an existing image', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    const pdf = await asset('document');
    const img = await asset('image');
    const base = { termId: term._id, name: 'Real Person', position: 'Chair' };
    expect((await client.post('/api/admin/content/committee-members').send({ ...base, imageMediaId: pdf._id })).status).toBe(400);
    expect((await client.post('/api/admin/content/committee-members').send({ ...base, imageMediaId: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
    expect((await client.post('/api/admin/content/committee-members').send({ ...base, imageMediaId: img._id })).status).toBe(201);
  });

  it('does not delete a term that still has members', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    const member = await CommitteeMember.create({ termId: term._id, name: 'Real Person', position: 'Chair' });
    const res = await client.del(`/api/admin/content/committee-terms/${term._id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_DEPENDENCIES');
    await client.del(`/api/admin/content/committee-members/${member._id}`);
    expect((await client.del(`/api/admin/content/committee-terms/${term._id}`)).status).toBe(200);
  });
});

describe('milestones and text blocks', () => {
  it('stores history milestones with era labels and sources', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await client.post('/api/admin/content/milestones').send({ periodLabel: 'Legend', title: 'Born of Maa Uma’s clay', text: 'Community tradition holds…', sourceRef: 'PS-ARC-0001' });
    expect(res.status).toBe(201);
    await client.post(`/api/admin/content/milestones/${res.body.data.item.id}/publish`);
    expect((await anon().get('/api/content/milestones')).body.data.items[0]).toMatchObject({ periodLabel: 'Legend', sourceRef: 'PS-ARC-0001' });
  });

  it('saves structured block items and lists unwritten blocks as empty', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const saved = await client.put('/api/admin/content/blocks/home.stats').send({
      items: [
        { value: '1,146', label: 'Families' },
        { value: '2,657', label: 'Members' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.block.status).toBe('draft');
    const list = await client.get('/api/admin/content/blocks');
    const byKey = Object.fromEntries(list.body.data.blocks.map((b: { key: string }) => [b.key, b]));
    expect(byKey['home.stats'].items).toHaveLength(2);
    expect(byKey['about.mission'].status).toBe('empty');

    await client.post('/api/admin/content/blocks/home.stats/publish');
    expect((await anon().get('/api/content/blocks/home.stats')).body.data.block.items[0]).toMatchObject({ value: '1,146', label: 'Families' });
    await client.post('/api/admin/content/blocks/home.stats/unpublish');
    expect((await anon().get('/api/content/blocks/home.stats')).status).toBe(404);
  });

  it('rejects markup, too many items and unknown keys in blocks', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.put('/api/admin/content/blocks/about.mission').send({ body: '<script>x</script>' })).status).toBe(400);
    expect((await client.put('/api/admin/content/blocks/home.stats').send({ items: Array.from({ length: 21 }, () => ({ value: '1', label: 'x' })) })).status).toBe(400);
    expect((await client.put('/api/admin/content/blocks/home.stats').send({ items: [{ value: '<b>1</b>', label: 'x' }] })).status).toBe(400);
    expect((await client.put('/api/admin/content/blocks/not.a.block').send({ body: 'x' })).status).toBe(400);
    expect((await client.put('/api/admin/content/blocks/about.activities').send({ items: [{ title: 'Yuva', imageMediaId: '11111111-1111-4111-8111-111111111111' }] })).status).toBe(400);
  });
});
