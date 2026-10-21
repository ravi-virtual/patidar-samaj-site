import type { Response } from 'express';

// Byte-order mark so Excel opens UTF-8 (Gujarati) text correctly. Written as an escape, not a
// literal, because an invisible character in source is easy to lose or corrupt.
const BOM = String.fromCharCode(0xfeff);

// Spreadsheet programs run cells that start with = + - @ (or tab/CR) as formulas. A member who
// registers with a name like "=HYPERLINK(...)" must not be able to attack whoever opens an export.
const neutralise = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Builds a CSV (CRLF line endings, UTF-8 BOM). */
export const toCsv = (headers: string[], rows: unknown[][]): string => {
  const lines = [headers.map(neutralise).join(','), ...rows.map((r) => r.map(neutralise).join(','))];
  return `${BOM}${lines.join('\r\n')}\r\n`;
};

/** Sends a CSV as a download. No caching, and the browser may not guess a different type. */
export const sendCsv = (res: Response, filename: string, csv: string): Response => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(csv);
};
