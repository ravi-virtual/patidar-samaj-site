import type { ContentResource, ContentRow } from '../../api/adminApi';

/**
 * Describes each kind of managed content once, so the list, the form and the validation hints are
 * generated from the same place. The server has the final say on every rule listed here.
 */

export type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'image' | 'document' | 'term';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  hint?: string;
  options?: string[];
  /** Spans both columns of the form grid. */
  wide?: boolean;
}

export interface ResourceDef {
  key: ContentResource;
  singular: string;
  plural: string;
  fields: FieldDef[];
  title: (r: ContentRow) => string;
  subtitle: (r: ContentRow) => string;
}

export const LINK_CATEGORIES = ['Forms', 'Documents', 'Services', 'Community', 'Other'];

export const resources: ResourceDef[] = [
  {
    key: 'faqs',
    singular: 'question',
    plural: 'FAQs',
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true, min: 5, max: 200, wide: true },
      { name: 'answer', label: 'Answer', type: 'textarea', required: true, max: 2000, wide: true },
    ],
    title: (r) => r.question ?? '',
    subtitle: (r) => r.answer ?? '',
  },
  {
    key: 'links',
    singular: 'link',
    plural: 'Links',
    fields: [
      { name: 'label', label: 'Title', type: 'text', required: true, min: 3, max: 120, wide: true },
      { name: 'description', label: 'Description', type: 'text', max: 200, wide: true },
      { name: 'category', label: 'Category', type: 'select', options: LINK_CATEGORIES },
      { name: 'url', label: 'Web address', type: 'text', max: 500, hint: 'Starting with https://. Leave empty if you attach a PDF instead.' },
      { name: 'fileMediaId', label: 'PDF document', type: 'document', wide: true },
    ],
    title: (r) => r.label ?? '',
    subtitle: (r) => r.url ?? (r.fileMediaId ? 'PDF download' : ''),
  },
  {
    key: 'milestones',
    singular: 'milestone',
    plural: 'History',
    fields: [
      { name: 'periodLabel', label: 'Year or era', type: 'text', required: true, max: 40, hint: 'For example 1950s, or Legend.' },
      { name: 'title', label: 'Title', type: 'text', required: true, min: 3, max: 150 },
      { name: 'text', label: 'Text', type: 'textarea', required: true, max: 1500, wide: true },
      { name: 'sourceRef', label: 'Source', type: 'text', max: 200, wide: true, hint: 'Where this is recorded. Shown beneath the entry.' },
      { name: 'imageMediaId', label: 'Image', type: 'image', wide: true },
    ],
    title: (r) => r.title ?? '',
    subtitle: (r) => `${r.periodLabel ?? ''}${r.sourceRef ? ` · ${r.sourceRef}` : ''}`,
  },
  {
    key: 'committee-terms',
    singular: 'term',
    plural: 'Committee terms',
    fields: [
      { name: 'label', label: 'Label', type: 'text', required: true, max: 40, hint: 'For example 2025–2027.' },
      { name: 'startYear', label: 'Start year', type: 'number', required: true, min: 1900, max: 2200 },
      { name: 'endYear', label: 'End year', type: 'number', required: true, min: 1900, max: 2200 },
      { name: 'isCurrent', label: 'This is the current term', type: 'checkbox', wide: true },
    ],
    title: (r) => r.label ?? '',
    subtitle: (r) => `${r.startYear ?? ''}–${r.endYear ?? ''}${r.isCurrent ? ' · current' : ''}`,
  },
  {
    key: 'committee-members',
    singular: 'member',
    plural: 'Committee members',
    fields: [
      { name: 'termId', label: 'Term', type: 'term', required: true, wide: true },
      { name: 'name', label: 'Name', type: 'text', required: true, min: 2, max: 100 },
      { name: 'position', label: 'Position', type: 'text', required: true, max: 80 },
      { name: 'bio', label: 'Short bio', type: 'textarea', max: 800, wide: true },
      { name: 'imageMediaId', label: 'Photo', type: 'image', wide: true },
    ],
    title: (r) => r.name ?? '',
    subtitle: (r) => r.position ?? '',
  },
];

/** Fixed text blocks of the site. `items` describes the repeating rows a block may have. */
export interface BlockDef {
  key: string;
  label: string;
  where: string;
  title?: boolean;
  body?: boolean;
  itemLabel?: string;
  maxItems?: number;
  itemFields?: { name: 'title' | 'text' | 'value' | 'label' | 'imageMediaId'; label: string; type: 'text' | 'textarea' | 'image'; max: number }[];
}

export const blocks: BlockDef[] = [
  { key: 'home.welcome', label: 'Home — welcome', where: 'Top of the home page', title: true, body: true, itemLabel: 'Hero picture', maxItems: 1, itemFields: [{ name: 'imageMediaId', label: 'Picture', type: 'image', max: 0 }] },
  { key: 'home.stats', label: 'Home — figures', where: 'Statistics beside the welcome', itemLabel: 'Figure', maxItems: 4, itemFields: [{ name: 'label', label: 'Label', type: 'text', max: 120 }, { name: 'value', label: 'Value', type: 'text', max: 40 }] },
  { key: 'about.intro', label: 'About — introduction', where: 'About page, opening', title: true, body: true },
  { key: 'about.volunteers', label: 'About — volunteers', where: 'About page, under the introduction', body: true },
  { key: 'about.mission', label: 'About — mission', where: 'About page', body: true },
  { key: 'about.vision', label: 'About — vision', where: 'About page', body: true },
  { key: 'about.values', label: 'About — values', where: 'About page', itemLabel: 'Value', maxItems: 8, itemFields: [{ name: 'title', label: 'Title', type: 'text', max: 120 }, { name: 'text', label: 'Text', type: 'textarea', max: 600 }] },
  { key: 'about.achievements', label: 'About — achievements', where: 'About page', itemLabel: 'Achievement', maxItems: 8, itemFields: [{ name: 'value', label: 'Value', type: 'text', max: 40 }, { name: 'label', label: 'Label', type: 'text', max: 120 }] },
  { key: 'about.activities', label: 'About — what we do', where: 'About page', itemLabel: 'Activity', maxItems: 8, itemFields: [{ name: 'title', label: 'Title', type: 'text', max: 120 }, { name: 'text', label: 'Text', type: 'textarea', max: 600 }, { name: 'imageMediaId', label: 'Picture', type: 'image', max: 0 }] },
  { key: 'history.intro', label: 'History — introduction', where: 'Top of the history page', title: true, body: true },
];
