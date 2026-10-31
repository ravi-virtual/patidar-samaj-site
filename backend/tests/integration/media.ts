import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import AuditLog from '../../src/models/AuditLog';
import CommitteeMember from '../../src/models/CommitteeMember';
import CommitteeTerm from '../../src/models/CommitteeTerm';
import Event from '../../src/models/Event';
import ImportantLink from '../../src/models/ImportantLink';
import MediaAsset from '../../src/models/MediaAsset';
import { Roles, config } from '../../src/config/constants';
import { ORIGIN, anon, connectTestDb, disconnectTestDb, makeEvent, resetDb, signInAs, READ_ONLY_ADMIN_PERMISSIONS,
  DRAFT_ADMIN_PERMISSIONS,
  OPS_ADMIN_PERMISSIONS } from '../helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body-for-tests'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('fake')]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

const uploadDir = () => config.uploads.dir;
const filesOnDisk = () => (existsSync(uploadDir()) ? readdirSync(uploadDir()) : []);

beforeAll(connectTestDb);
afterAll(async () => {
  await rm(uploadDir(), { recursive: true, force: true });
  await disconnectTestDb();
});
beforeEach(async () => {
  await resetDb();
  await rm(uploadDir(), { recursive: true, force: true });
});

const upload = (client: Awaited<ReturnType<typeof signInAs>>['client'], buf: Buffer, filename: string, type: string, fields: Record<string, string> = {}) => {
  let req = client.post('/api/admin/media').attach('file', buf, { filename, contentType: type });
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req;
};

describe('upload permissions', () => {
  it('rejects visitors and admins without media.upload; allows those who have it and the Super Admin', async () => {
    expect((await anon().post('/api/admin/media').set('Origin', ORIGIN).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    for (const permissions of [[], READ_ONLY_ADMIN_PERMISSIONS]) {
      const { client } = await signInAs(Roles.ADMIN, { permissions });
      expect((await upload(client, PNG, 'a.png', 'image/png')).status).toBe(403);
    }
    for (const [role, permissions] of [[Roles.ADMIN, DRAFT_ADMIN_PERMISSIONS], [Roles.ADMIN, OPS_ADMIN_PERMISSIONS], [Roles.SUPER_ADMIN, []]] as const) {
      const { client } = await signInAs(role, { permissions: [...permissions] });
      expect((await upload(client, PNG, 'a.png', 'image/png')).status, role).toBe(201);
    }
    expect(filesOnDisk()).toHaveLength(3);
  });

  it('needs the CSRF token even for multipart uploads', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await client.agent.post('/api/admin/media').set('Origin', ORIGIN).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(filesOnDisk()).toHaveLength(0);
  });
});

describe('what an upload may be', () => {
  it.each([
    ['PNG', PNG, 'image/png', 'png', 'image'],
    ['JPEG', JPEG, 'image/jpeg', 'jpg', 'image'],
    ['WebP', WEBP, 'image/webp', 'webp', 'image'],
    ['PDF', PDF, 'application/pdf', 'pdf', 'document'],
  ])('accepts a real %s and stores it under a generated name', async (_n, buf, type, ext, kind) => {
    const { user, client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await upload(client, buf, `holiday photo.${ext}`, type, { altText: 'A description' });
    expect(res.status).toBe(201);
    const m = res.body.data.media;
    expect(m).toMatchObject({ mimeType: type, kind, altText: 'A description', visibility: 'public', size: buf.length });
    expect(m.url).toBe(`/api/media/${m.id}`);

    const stored = await MediaAsset.findById(m.id).lean();
    expect(stored?.storedName).toMatch(new RegExp(`^[0-9a-f-]{36}\\.${ext}$`));
    expect(stored?.uploadedBy).toBe(user._id);
    expect(await readFile(join(uploadDir(), stored!.storedName))).toEqual(buf);
    expect(JSON.stringify(res.body)).not.toContain(stored!.storedName); // internal name not exposed
    expect(await AuditLog.countDocuments({ action: 'media.uploaded' })).toBe(1);
  });

  it('takes the extension from the content, not from the filename, and never uses the name as a path', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    for (const name of ['evil.php.png', '../../etc/passwd.png', '..\\..\\windows\\system.ini', 'name with spaces.PNG', 'x'.repeat(300) + '.png']) {
      const res = await upload(client, PNG, name, 'image/png');
      expect(res.status, name).toBe(201);
      expect(res.body.data.media.name).not.toMatch(/[\\/]/);
      expect(res.body.data.media.name.length).toBeLessThanOrEqual(200);
    }
    const names = filesOnDisk();
    expect(names).toHaveLength(5);
    for (const n of names) expect(n).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(existsSync(join(uploadDir(), '..', '..', 'etc'))).toBe(false);
  });

  it.each([
    ['HTML pretending to be a PNG', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png'],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'],
    ['an SVG renamed to png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.png', 'image/png'],
    ['a Windows executable', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), 'x.png', 'image/png'],
    ['a PHP script', Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php', 'application/x-php'],
    ['a shell script', Buffer.from('#!/bin/sh\nrm -rf /\n'), 'x.sh', 'text/x-sh'],
    ['a ZIP archive', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), 'x.zip', 'application/zip'],
    ['an empty file', Buffer.alloc(0), 'x.png', 'image/png'],
    ['plain text as PDF', Buffer.from('just text'), 'x.pdf', 'application/pdf'],
  ])('rejects %s', async (_label, buf, name, type) => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await upload(client, buf, name, type);
    expect(res.status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0);
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it('rejects a file whose content does not match the type it declares', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await upload(client, PNG, 'a.jpg', 'image/jpeg')).status).toBe(400); // PNG bytes, JPEG label
    expect((await upload(client, PDF, 'a.png', 'image/png')).status).toBe(400); // PDF bytes, PNG label
    expect((await upload(client, PNG, 'a.pdf', 'application/pdf')).status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('enforces size limits: images 5 MB, documents 10 MB', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const bigImage = Buffer.concat([PNG, Buffer.alloc(config.uploads.maxImageBytes)]);
    expect((await upload(client, bigImage, 'big.png', 'image/png')).status).toBe(413);

    const mediumPdf = Buffer.concat([PDF, Buffer.alloc(config.uploads.maxImageBytes + 1024)]); // over image limit, under document limit
    expect((await upload(client, mediumPdf, 'ok.pdf', 'application/pdf')).status).toBe(201);

    const hugePdf = Buffer.concat([PDF, Buffer.alloc(config.uploads.maxDocumentBytes)]);
    expect((await upload(client, hugePdf, 'huge.pdf', 'application/pdf')).status).toBe(413);
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('rejects requests with no file, the wrong field name, or more than one file', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.post('/api/admin/media').field('altText', 'x')).status).toBe(400);
    expect((await client.post('/api/admin/media').attach('document', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(400);
    const two = await client
      .post('/api/admin/media')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' });
    expect(two.status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('validates the description and visibility fields', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await upload(client, PNG, 'a.png', 'image/png', { altText: '<script>x</script>' })).status).toBe(400);
    expect((await upload(client, PNG, 'a.png', 'image/png', { visibility: 'everyone' })).status).toBe(400);
    expect((await upload(client, PNG, 'a.png', 'image/png', { altText: 'x'.repeat(201) })).status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0);
  });
});

describe('serving files', () => {
  const putAsset = async (over: Partial<{ visibility: 'public' | 'private'; buf: Buffer; ext: string; mime: string }> = {}) => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const res = await upload(client, over.buf ?? PNG, `file.${over.ext ?? 'png'}`, over.mime ?? 'image/png', { visibility: over.visibility ?? 'public' });
    return res.body.data.media as { id: string; url: string };
  };

  it('serves public files to anyone, with safe headers', async () => {
    const m = await putAsset();
    const res = await anon().get(m.url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'none'.*sandbox/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="file\.png"/);
    expect(Buffer.from(res.body)).toEqual(PNG);
  });

  it('serves PDFs with the PDF type and the same protections', async () => {
    const m = await putAsset({ buf: PDF, ext: 'pdf', mime: 'application/pdf' });
    const res = await anon().get(m.url);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-security-policy']).toMatch(/sandbox/);
  });

  it('keeps staff-only files from visitors (404, not 403) but shows them to signed-in staff', async () => {
    const m = await putAsset({ visibility: 'private' });
    expect((await anon().get(m.url)).status).toBe(404);
    const { client: viewer } = await signInAs(Roles.ADMIN, { permissions: READ_ONLY_ADMIN_PERMISSIONS });
    const res = await viewer.get(m.url);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/private, no-store/);
  });

  it('returns 404 for deleted, missing-on-disk and unknown files, and 400 for malformed ids', async () => {
    const m = await putAsset();
    const stored = await MediaAsset.findById(m.id).lean();
    await rm(join(uploadDir(), stored!.storedName));
    expect((await anon().get(m.url)).status).toBe(404); // record exists, file lost
    expect((await anon().get('/api/media/11111111-1111-4111-8111-111111111111')).status).toBe(404);
    expect((await anon().get('/api/media/not-an-id')).status).toBe(400);
    await MediaAsset.updateOne({ _id: m.id }, { $set: { isDeleted: true } });
    expect((await anon().get(m.url)).status).toBe(404);
  });

  it('never serves a path outside the upload folder, even if a record were tampered with', async () => {
    const asset = await MediaAsset.create({
      storedName: '../../package.json',
      originalName: 'x',
      mimeType: 'application/pdf',
      size: 10,
      kind: 'document',
    });
    expect((await anon().get(`/api/media/${asset._id}`)).status).toBe(404);
  });
});

describe('media library management', () => {
  it('lists for staff with filters, and not for admins without the permission', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    await upload(client, PNG, 'banner.png', 'image/png');
    await upload(client, PDF, 'minutes-2025.pdf', 'application/pdf');
    expect((await client.get('/api/admin/media')).body.data.totalCount).toBe(2);
    expect((await client.get('/api/admin/media?kind=document')).body.data.media[0].name).toBe('minutes-2025.pdf');
    expect((await client.get('/api/admin/media?search=BANNER')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/media?kind=exe')).status).toBe(400);
    const { client: none } = await signInAs(Roles.ADMIN, { permissions: [] });
    expect((await none.get('/api/admin/media')).status).toBe(403);
  });

  it('edits description and visibility, and nothing else', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const m = (await upload(client, PNG, 'a.png', 'image/png')).body.data.media;
    const res = await client.patch(`/api/admin/media/${m.id}`).send({ altText: 'New text', visibility: 'private', storedName: 'hacked', size: 1, mimeType: 'text/html' });
    expect(res.status).toBe(200);
    const stored = await MediaAsset.findById(m.id).lean();
    expect(stored).toMatchObject({ altText: 'New text', visibility: 'private', mimeType: 'image/png', size: PNG.length });
    expect(stored?.storedName).not.toBe('hacked');
    expect((await client.patch(`/api/admin/media/${m.id}`).send({ visibility: 'everyone' })).status).toBe(400);
  });

  it('refuses to delete a file that is still in use, naming where', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const image = (await upload(client, PNG, 'a.png', 'image/png')).body.data.media;
    const pdf = (await upload(client, PDF, 'a.pdf', 'application/pdf')).body.data.media;
    await makeEvent({ title: 'Event With Banner' }).then((e) => Event.updateOne({ _id: e._id }, { $set: { imageMediaId: image.id } }));
    await ImportantLink.create({ label: 'Linked PDF', fileMediaId: pdf.id });

    const a = await client.del(`/api/admin/media/${image.id}`);
    expect(a.status).toBe(409);
    expect(a.body.message).toMatch(/event/);
    const b = await client.del(`/api/admin/media/${pdf.id}`);
    expect(b.status).toBe(409);
    expect(b.body.message).toMatch(/important link/);
    expect(filesOnDisk()).toHaveLength(2);
    expect((await anon().get(image.url)).status).toBe(200);
  });

  it('deleting a record that used a file does not delete the shared file', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const image = (await upload(client, PNG, 'portrait.png', 'image/png')).body.data.media;
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    const member = await CommitteeMember.create({ termId: term._id, name: 'Real Person', position: 'Chair', imageMediaId: image.id });

    expect((await client.del(`/api/admin/content/committee-members/${member._id}`)).status).toBe(200);
    expect((await anon().get(image.url)).status).toBe(200); // file untouched
    expect(filesOnDisk()).toHaveLength(1);

    // Now nothing uses it, so it can be removed deliberately.
    expect((await client.del(`/api/admin/media/${image.id}`)).status).toBe(200);
    expect(filesOnDisk()).toHaveLength(0);
    expect((await MediaAsset.findById(image.id).lean())?.isDeleted).toBe(true);
    expect((await anon().get(image.url)).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: 'media.deleted' })).toBe(1);
  });

  it('lets admins with only upload permission upload but not delete', async () => {
    const { client: admin } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const m = (await upload(admin, PNG, 'a.png', 'image/png')).body.data.media;
    const { client: editor } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });
    expect((await editor.del(`/api/admin/media/${m.id}`)).status).toBe(403);
    expect((await MediaAsset.findById(m.id).lean())?.isDeleted).toBe(false);
  });

  it('supports replacing an image: upload new, point the record at it, then remove the old one', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const oldImg = (await upload(client, PNG, 'old.png', 'image/png')).body.data.media;
    const newImg = (await upload(client, JPEG, 'new.jpg', 'image/jpeg')).body.data.media;
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027 });
    const member = await CommitteeMember.create({ termId: term._id, name: 'Real Person', position: 'Chair', imageMediaId: oldImg.id });

    expect((await client.del(`/api/admin/media/${oldImg.id}`)).status).toBe(409);
    expect((await client.patch(`/api/admin/content/committee-members/${member._id}`).send({ imageMediaId: newImg.id })).status).toBe(200);
    expect((await client.del(`/api/admin/media/${oldImg.id}`)).status).toBe(200);
    expect((await anon().get(newImg.url)).status).toBe(200);
  });
});
