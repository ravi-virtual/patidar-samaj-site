import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/constants';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  /** True only if a message was actually handed to a delivery channel. */
  delivered: boolean;
  driver: 'outbox' | 'none';
}

/**
 * Email abstraction with no paid dependency.
 *  - "outbox": development only; writes the message to backend/.outbox/ so flows can be tested.
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
  return { delivered: false, driver: 'none' };
};
