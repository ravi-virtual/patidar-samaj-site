import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config/constants';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  /** True only if a message was actually handed to a delivery channel. */
  delivered: boolean;
  driver: 'outbox' | 'smtp' | 'none';
}

/**
 * Email abstraction with no paid dependency.
 *  - "outbox": development only; writes the message to backend/.outbox/ so flows can be tested.
 *  - "smtp":   real delivery through the SMTP_* settings; failures are logged and reported, never thrown.
 *  - "none":   production default until an SMTP provider is configured; nothing is sent.
 * Callers must never claim an email was sent unless `delivered` is true.
 */
export const sendMail = async (message: MailMessage): Promise<MailResult> => {
  if (config.mail.driver === 'outbox' && !config.isProduction) {
    const dir = join(process.cwd(), '.outbox');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${Date.now()}-${randomUUID()}.txt`), `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`, 'utf8');
    return { delivered: true, driver: 'outbox' };
  }
  if (config.mail.driver === 'smtp') {
    const { host, port, secure, user, pass, from } = config.mail;
    if (!user || !pass || !from) {
      console.error('Mail: MAIL_DRIVER=smtp but SMTP_USER, SMTP_PASS or MAIL_FROM is not set.');
      return { delivered: false, driver: 'smtp' };
    }
    try {
      await getTransport(host, port, secure, user, pass).sendMail({ from, to: message.to, subject: message.subject, text: message.text });
      return { delivered: true, driver: 'smtp' };
    } catch (err) {
      console.error('Mail: could not send message:', err instanceof Error ? err.message : err);
      return { delivered: false, driver: 'smtp' };
    }
  }
  return { delivered: false, driver: 'none' };
};

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
const getTransport = (host: string, port: number, secure: boolean, user: string, pass: string) =>
  (transport ??= nodemailer.createTransport({ host, port, secure, auth: { user, pass } }));
