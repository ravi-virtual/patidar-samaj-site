import type { PublicSettings, PublicTabKey } from '../api/types';

/** Every public tab an administrator can switch off, with the wording used in Admin > Settings. */
export const PUBLIC_TABS: { key: PublicTabKey; label: string; description: string }[] = [
  { key: 'about', label: 'About', description: 'The About the Samaj page.' },
  { key: 'history', label: 'History', description: 'The history timeline.' },
  { key: 'committee', label: 'Committee', description: 'Committee members by term.' },
  { key: 'faq', label: 'FAQ', description: 'Frequently asked questions.' },
  { key: 'links', label: 'Links', description: 'Important links and forms.' },
  { key: 'directory', label: 'Members directory', description: 'The searchable list of member families.' },
  { key: 'events', label: 'Events', description: 'Upcoming and past events.' },
  { key: 'news', label: 'News', description: 'Announcements and notices.' },
  { key: 'contact', label: 'Contact', description: 'Contact details and the enquiry form.' },
];

/**
 * Whether a tab is shown. Missing settings (still loading or failed) and missing keys count as on,
 * the same rule the server applies, so older data keeps working.
 */
export const isTabOn = (settings: Pick<PublicSettings, 'publicTabs'> | null | undefined, tab: PublicTabKey): boolean =>
  settings?.publicTabs?.[tab] !== false;
