import { describe, it, expect } from 'vitest';
import { Schema } from 'mongoose';
import { toCsv, sendCsv } from '../../src/utils/csv';
import { escapeRegex } from '../../src/utils/escapeRegex';
import { detectFileType } from '../../src/utils/fileType';
import { pageParams } from '../../src/utils/pagination';
import { hashPassword, validatePasswordStrength, verifyPassword, verifyAgainstDummy } from '../../src/utils/password';
import { mayEditItem } from '../../src/utils/publishPolicy';
import { publishableDefinition } from '../../src/utils/schemaFields';
import { csrfTokenFor, generateToken, hashToken, safeEqual } from '../../src/utils/tokens';
import { sendError } from '../../src/utils/apiResponse';
import { ErrorCodes } from '../../src/config/constants';
import { Permissions } from '../../src/config/permissions';

const fakeRes = () => {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      headers[k] = v;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(b: unknown) {
      res.body = b;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
  };
  return res;
};

describe('csv', () => {
  it('writes a BOM, CRLF line endings and quotes every cell', () => {
    const out = toCsv(['Name', 'City'], [['Asha', 'Unjha']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('"Name","City"\r\n"Asha","Unjha"\r\n');
  });

  it('doubles embedded quotes and keeps commas and newlines inside the cell', () => {
    const out = toCsv(['a'], [['say "hi", ok\nbye']]);
    expect(out).toContain('"say ""hi"", ok\nbye"');
  });

  it('renders null and undefined as empty cells and numbers as text', () => {
    const out = toCsv(['a', 'b', 'c'], [[null, undefined, 42]]);
    expect(out).toContain('"","","42"');
  });

  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx'])('neutralises the spreadsheet formula %j', (value) => {
    const out = toCsv(['a'], [[value]]);
    expect(out).toContain(`"'${value}"`);
  });

  it('does not alter text that merely contains a formula character later on', () => {
    expect(toCsv(['a'], [['a=b']])).toContain('"a=b"');
  });

  it('neutralises header cells too', () => {
    expect(toCsv(['=evil'], [])).toContain(`"'=evil"`);
  });

  it('produces only the header row for no data', () => {
    expect(toCsv(['a', 'b'], []).slice(1)).toBe('"a","b"\r\n');
  });

  it('sends a download with safe headers and a sanitised filename', () => {
    const res = fakeRes();
    sendCsv(res as never, 'members "2026"/../x.csv', 'data');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="members__2026__.._x.csv"');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.body).toBe('data');
  });
});

describe('escapeRegex', () => {
  it('escapes every regular expression metacharacter', () => {
    const special = '.*+?^${}()|[]\\';
    const re = new RegExp(`^${escapeRegex(special)}$`);
    expect(re.test(special)).toBe(true);
  });

  it('makes user text match literally', () => {
    expect(new RegExp(escapeRegex('.*')).test('abc')).toBe(false);
    expect(new RegExp(escapeRegex('a.c')).test('abc')).toBe(false);
    expect(new RegExp(escapeRegex('a.c')).test('a.c')).toBe(true);
  });

  it('leaves ordinary text, Gujarati and the empty string alone', () => {
    expect(escapeRegex('Patidar Samaj')).toBe('Patidar Samaj');
    expect(escapeRegex('પાટીદાર')).toBe('પાટીદાર');
    expect(escapeRegex('')).toBe('');
  });
});

describe('detectFileType', () => {
  const pad = (bytes: number[]) => Buffer.from([...bytes, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  it('recognises JPEG, PNG, WebP and PDF by signature', () => {
    expect(detectFileType(pad([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: 'image/jpeg', ext: 'jpg', kind: 'image' });
    expect(detectFileType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ mime: 'image/png', ext: 'png', kind: 'image' });
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
    expect(detectFileType(webp)).toEqual({ mime: 'image/webp', ext: 'webp', kind: 'image' });
    expect(detectFileType(Buffer.from('%PDF-1.7\n'))).toEqual({ mime: 'application/pdf', ext: 'pdf', kind: 'document' });
  });

  it('rejects SVG, HTML, scripts, executables and ZIP even when they claim to be images', () => {
    for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<html></html>', '<?xml version="1.0"?>', '#!/bin/sh', 'GIF89a']) {
      expect(detectFileType(Buffer.from(text))).toBeNull();
    }
    expect(detectFileType(pad([0x4d, 0x5a]))).toBeNull(); // MZ (exe)
    expect(detectFileType(pad([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // zip
  });

  it('rejects RIFF files that are not WebP (for example WAV)', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WAVEfmt ')]);
    expect(detectFileType(wav)).toBeNull();
  });

  it('rejects empty and truncated buffers without throwing', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectFileType(Buffer.from('RIFF'))).toBeNull();
    expect(detectFileType(Buffer.from('%PDF'))).toBeNull();
  });
});

describe('pageParams', () => {
  it('defaults to page 1 and the default limit', () => {
    expect(pageParams({})).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(pageParams({}, 50)).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('computes skip from page and limit', () => {
    expect(pageParams({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20 });
  });
});

describe('password', () => {
  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Correct-Horse-9')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse-9')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('Same-Password-1')).not.toBe(await hashPassword('Same-Password-1'));
  });

  it('treats a malformed hash as a failed check instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
    expect(await verifyPassword('', 'whatever')).toBe(false);
  });

  it('runs the dummy verification without throwing (timing equaliser)', async () => {
    await expect(verifyAgainstDummy('anything')).resolves.toBeUndefined();
  });

  describe('validatePasswordStrength', () => {
    it('accepts a strong password', () => {
      expect(validatePasswordStrength('Correct-Horse-9')).toBeNull();
    });

    it('enforces the length bounds exactly', () => {
      expect(validatePasswordStrength('Abcdefgh1')).toMatch(/at least 10/);
      expect(validatePasswordStrength('Abcdefghi1')).toBeNull();
      expect(validatePasswordStrength(`A1${'x'.repeat(126)}`)).toBeNull();
      expect(validatePasswordStrength(`A1${'x'.repeat(127)}`)).toMatch(/at most 128/);
    });

    it('rejects common passwords regardless of case', () => {
      expect(validatePasswordStrength('PASSWORD123')).toMatch(/too common/);
      expect(validatePasswordStrength('Patidar123')).toMatch(/too common/);
      expect(validatePasswordStrength('1234567890')).toMatch(/too common/);
    });

    it('requires a letter and a number', () => {
      expect(validatePasswordStrength('onlylettersnonumber')).toMatch(/letter and one number/);
      expect(validatePasswordStrength('12345678901234')).toMatch(/letter and one number/);
    });

    it('rejects passwords containing the email name, but only for names of 4+ characters', () => {
      expect(validatePasswordStrength('Ravi-Patel-2026', 'ravi.patel@example.com')).toBeNull();
      expect(validatePasswordStrength('xx-Ravipatel-2026', 'ravipatel@example.com')).toMatch(/email name/);
      expect(validatePasswordStrength('Bob-Is-Here-2026', 'bob@example.com')).toBeNull();
    });

    it('ignores a missing email', () => {
      expect(validatePasswordStrength('Correct-Horse-9', undefined)).toBeNull();
      expect(validatePasswordStrength('Correct-Horse-9', 'no-at-sign')).toBeNull();
    });
  });
});

describe('mayEditItem', () => {
  const user = (permissions: string[]) => ({ permissions }) as unknown as Express.AuthUser;

  it('refuses when there is no user', () => {
    expect(mayEditItem(undefined, 'draft', Permissions.EVENTS_PUBLISH)).toBe(false);
  });

  it('lets anyone signed in work on drafts', () => {
    expect(mayEditItem(user([]), 'draft', Permissions.EVENTS_PUBLISH)).toBe(true);
  });

  it.each(['published', 'cancelled', 'archived'])('needs the publish permission once an item is %s', (status) => {
    expect(mayEditItem(user([]), status, Permissions.EVENTS_PUBLISH)).toBe(false);
    expect(mayEditItem(user([Permissions.ANNOUNCEMENTS_PUBLISH]), status, Permissions.EVENTS_PUBLISH)).toBe(false);
    expect(mayEditItem(user([Permissions.EVENTS_PUBLISH]), status, Permissions.EVENTS_PUBLISH)).toBe(true);
  });
});

describe('publishableDefinition', () => {
  it('defines draft status, order 0 and not-deleted defaults', () => {
    const schema = new Schema(publishableDefinition);
    expect(schema.path('status').options.default).toBe('draft');
    expect(schema.path('order').options.default).toBe(0);
    expect(schema.path('isDeleted').options.default).toBe(false);
  });

  it('only allows the known publish statuses', () => {
    const schema = new Schema(publishableDefinition);
    expect(schema.path('status').options.enum).toEqual(['draft', 'published', 'archived']);
  });
});

describe('tokens', () => {
  it('generates distinct URL-safe 256-bit tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically to sha256 hex and never returns the input', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('derives the CSRF token from the session token, stably and uniquely', () => {
    expect(csrfTokenFor('session-one')).toBe(csrfTokenFor('session-one'));
    expect(csrfTokenFor('session-one')).not.toBe(csrfTokenFor('session-two'));
    expect(csrfTokenFor('session-one')).not.toBe(hashToken('session-one'));
  });

  it('compares strings in constant time without throwing on length differences', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('sendError', () => {
  it('uses safe defaults', () => {
    const res = fakeRes();
    sendError(res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Something went wrong',
      error: { code: ErrorCodes.SERVER_ERROR, details: [] },
    });
  });

  it('carries the given status, code and details', () => {
    const res = fakeRes();
    sendError(res as never, { statusCode: 400, message: 'Bad', code: ErrorCodes.VALIDATION_ERROR, details: [{ field: 'x', message: 'y' }] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: [{ field: 'x', message: 'y' }] } });
  });
});
