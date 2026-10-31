// Shapes returned by the public API (see docs/api-reference.md). The server builds each of them
// from an allowlist, so anything not listed here is never sent to the browser.

/** The public website tabs an administrator can switch off. */
export type PublicTabKey = 'about' | 'history' | 'committee' | 'faq' | 'links' | 'directory' | 'events' | 'news' | 'contact';
export type PublicTabs = Record<PublicTabKey, boolean>;

export interface PublicSettings {
  name: string;
  shortName: string;
  invocation: string;
  tagline: string;
  logoUrl?: string | null;
  contact: { email: string; phone: string; address: string; officeHours: string };
  socialLinks: { label: string; url: string }[];
  footerNote: string;
  publicTabs: PublicTabs;
  themeDefault: 'system' | 'light' | 'dark';
}

export interface ContentItem {
  title: string | null;
  text: string | null;
  value: string | null;
  label: string | null;
  imageMediaId: string | null;
}

export interface ContentBlock {
  id: string;
  key: string;
  title: string | null;
  body: string | null;
  items: ContentItem[];
}

export interface EventItem {
  id: string;
  title: string;
  category: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  status: 'published' | 'cancelled';
  cancellationReason: string | null;
  featured: boolean;
  imageMediaId: string | null;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  pinned: boolean;
  featured: boolean;
  archived: boolean;
  publishedAt: string;
  body?: string;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  village: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  bio: string | null;
  joinedYear: number | null;
  highlighted: boolean;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface ImportantLink {
  id: string;
  label: string;
  description: string | null;
  url: string | null;
  fileMediaId: string | null;
  category: string;
}

export interface Milestone {
  id: string;
  periodLabel: string;
  title: string;
  text: string;
  imageMediaId: string | null;
  sourceRef: string | null;
}

export interface CommitteeTerm {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  isCurrent: boolean;
}

export interface CommitteeMember {
  id: string;
  termId: string;
  name: string;
  position: string;
  bio: string | null;
  imageMediaId: string | null;
}

export interface HomeData {
  settings: PublicSettings;
  blocks: Record<string, ContentBlock>;
  featuredEvent: EventItem | null;
  upcomingEvents: EventItem[];
  announcements: AnnouncementItem[];
  memberHighlights: DirectoryEntry[];
  links: ImportantLink[];
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string | null;
  date?: string;
}

export interface SearchResults {
  events: SearchHit[];
  announcements: SearchHit[];
  faqs: SearchHit[];
  history: SearchHit[];
  links: SearchHit[];
  members: SearchHit[];
}

export const EVENT_CATEGORIES = ['Festival', 'Family', 'Seva', 'Education', 'Meeting', 'Sports', 'Other'] as const;
export const ANNOUNCEMENT_CATEGORIES = ['Notice', 'Event', 'Education', 'Seva', 'Achievement'] as const;
export const CONTACT_TOPICS = [
  'General enquiry',
  'Membership',
  'Patidar Samaj Bhavan booking',
  'Scholarships',
] as const;
