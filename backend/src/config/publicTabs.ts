// The public website tabs an administrator can switch off (Admin > Settings > Public site tabs).
// A tab that is missing from the stored settings counts as on, so older data keeps working.
export const PublicTabs = ['about', 'history', 'committee', 'faq', 'links', 'directory', 'events', 'news', 'contact'] as const;

export type PublicTab = (typeof PublicTabs)[number];
export type PublicTabsState = Record<PublicTab, boolean>;

/** Full on/off map for every tab, filling in `true` for anything not stored. */
export const resolvePublicTabs = (stored?: Partial<Record<string, boolean | null | undefined>> | null): PublicTabsState =>
  Object.fromEntries(PublicTabs.map((tab) => [tab, stored?.[tab] !== false])) as PublicTabsState;
