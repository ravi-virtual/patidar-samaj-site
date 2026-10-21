/** Escapes user text before it is used inside a regular expression (search boxes). */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
