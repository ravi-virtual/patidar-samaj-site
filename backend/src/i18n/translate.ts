import { guMessages, guPatterns } from './gu';

export type Language = 'en' | 'gu';
export const LANGUAGES: readonly Language[] = ['en', 'gu'];

/** Picks the language from an Accept-Language header ("gu", "gu-IN,en;q=0.8"...). Anything else is English. */
export const parseLanguage = (header: string | undefined): Language => {
  const first = (header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first === 'gu' || first.startsWith('gu-') ? 'gu' : 'en';
};

/** Translates one server message; unknown messages come back unchanged (English). */
export const translateMessage = (message: string, lang: Language): string => {
  if (lang !== 'gu') return message;
  const exact = guMessages[message];
  if (exact) return exact;
  for (const [pattern, translation] of guPatterns) {
    const match = message.match(pattern);
    if (!match) continue;
    return typeof translation === 'function' ? translation(match) : message.replace(pattern, translation);
  }
  return message;
};
