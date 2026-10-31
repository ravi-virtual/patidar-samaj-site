import type { Language } from '../i18n/translate';

/** The sibling field that holds the Gujarati text of `field` (title -> titleGu). */
export const guField = (field: string): string => `${field}Gu`;

/**
 * Public view of a record in the visitor's language. For Gujarati each listed field is replaced by
 * its `<field>Gu` text when one was entered (otherwise the English text stays), and every `*Gu`
 * field is dropped so public responses stay the same shape in both languages.
 */
export const localizeFields = <T extends object>(record: T, fields: readonly string[], lang: Language): T => {
  const out = { ...record } as Record<string, unknown>;
  for (const field of fields) {
    const gu = out[guField(field)];
    if (lang === 'gu' && typeof gu === 'string' && gu.trim() !== '') out[field] = gu;
    delete out[guField(field)];
  }
  return out as T;
};

/**
 * The text fields a search should look in. Gujarati visitors also match the Gujarati twins; English
 * visitors search the English text only.
 */
export const searchFieldsFor = (fields: readonly string[], lang: Language): string[] =>
  lang === 'gu' ? [...fields, ...fields.map(guField)] : [...fields];
