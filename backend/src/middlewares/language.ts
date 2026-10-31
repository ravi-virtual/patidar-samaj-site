import type { NextFunction, Request, Response } from 'express';
import { parseLanguage, translateMessage } from '../i18n/translate';

/**
 * Reads the portal language from the Accept-Language header (set by the front end) into req.lang,
 * and, for Gujarati, translates the `message` and each error detail of every JSON response so
 * controllers can keep writing plain English messages.
 */
export const language = (req: Request, res: Response, next: NextFunction) => {
  req.lang = parseLanguage(req.header('accept-language'));
  res.setHeader('Content-Language', req.lang);
  res.vary('Accept-Language');
  if (req.lang === 'en') return next();

  const lang = req.lang;
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const out = body as { message?: unknown; error?: { details?: { message?: unknown }[] } };
      if (typeof out.message === 'string') out.message = translateMessage(out.message, lang);
      for (const detail of out.error?.details ?? []) {
        if (typeof detail?.message === 'string') detail.message = translateMessage(detail.message, lang);
      }
    }
    return json(body);
  };
  return next();
};
