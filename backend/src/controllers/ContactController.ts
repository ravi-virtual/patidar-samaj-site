import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import ContactMessage from '../models/ContactMessage';
import { ContactStatus, ErrorCodes, ResponseCodes, config } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { hashToken } from '../utils/tokens';
import { writeAudit } from '../utils/audit';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_SENDER = 3; // same email within the hour
const MAX_PER_IP = 6; // same network within the hour

/**
 * @name submitContact
 * @file ContactController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Public contact form. The message is saved for the Samaj office to read in the admin
 * inbox. It is NOT emailed, and the reply says so: "received", never "sent". Abuse controls: the
 * route rate limiter, a hidden honeypot field, and per-sender and per-network hourly caps. The
 * network address is stored only as a hash.
 * @author Ravi Patel
 */
export const submitContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      name: string;
      email: string;
      topic?: string;
      message: string;
      website?: string;
    }>(req, { locations: ['body'] });

    const thanks = (reference?: string) =>
      new ApiResponse(
        ResponseCodes.CREATED,
        'Thank you. Your message has been received by the Samaj office. We do not send an automatic confirmation email; someone will reply to the address you gave.',
        reference ? { reference } : {},
      ).send(res);

    // A filled honeypot means a bot. Look successful, store nothing, give it nothing to learn from.
    if (data.website && data.website.trim() !== '') {
      await writeAudit(req, { action: 'contact.spam_blocked', outcome: 'failure', actorId: null, metadata: { reason: 'honeypot' } });
      return thanks();
    }

    const ipHash = hashToken(`${req.ip}|${config.session.secret}`).slice(0, 32);
    const since = new Date(Date.now() - WINDOW_MS);
    const [fromSender, fromIp] = await Promise.all([
      ContactMessage.countDocuments({ email: data.email, createdAt: { $gte: since } }),
      ContactMessage.countDocuments({ ipHash, createdAt: { $gte: since } }),
    ]);
    if (fromSender >= MAX_PER_SENDER || fromIp >= MAX_PER_IP) {
      await writeAudit(req, { action: 'contact.throttled', outcome: 'failure', actorId: null });
      return sendError(res, {
        statusCode: ResponseCodes.TOO_MANY_REQUESTS,
        message: 'You have sent several messages recently. Please wait a while before sending another.',
        code: ErrorCodes.RATE_LIMITED,
      });
    }

    const message = await ContactMessage.create({
      name: data.name,
      email: data.email,
      topic: data.topic ?? 'General enquiry',
      message: data.message,
      status: ContactStatus.NEW,
      ipHash,
    });
    return thanks(message._id.slice(0, 8).toUpperCase());
  } catch (err) {
    return next(err);
  }
};
