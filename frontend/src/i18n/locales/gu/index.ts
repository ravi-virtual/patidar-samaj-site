import { common } from './common';
import { publicSite } from './publicSite';
import { adminPages } from './adminPages';
import { adminForms } from './adminForms';

/** English text -> Gujarati. Split by area so each file stays small; keys must be unique across files. */
export const gu: Record<string, string> = { ...common, ...publicSite, ...adminPages, ...adminForms };
