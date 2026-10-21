import type { Model } from 'mongoose';
import Faq from '../models/Faq';
import ImportantLink from '../models/ImportantLink';
import HistoryMilestone from '../models/HistoryMilestone';
import CommitteeTerm from '../models/CommitteeTerm';
import CommitteeMember from '../models/CommitteeMember';

export interface ContentResource {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one registry serves several schemas
  model: Model<any>;
  /** The only fields included in public responses (plus the id). Nothing else is ever sent. */
  publicFields: readonly string[];
  /** The only fields accepted from a create or update request. */
  writableFields: readonly string[];
  /** Fields staff can filter the list by. */
  filterFields: readonly string[];
  /** Text fields the search box looks in. */
  searchFields: readonly string[];
  sort: Record<string, 1 | -1>;
  /** Fields holding a reference to an uploaded image or document. */
  mediaFields: readonly string[];
}

// To add another simple, orderable, publishable content type: add a model, an entry here and a
// validation rule set in validators/contentValidator.ts. Controllers and routes need no changes.
export const ContentResources: Record<string, ContentResource> = {
  faqs: {
    label: 'FAQ',
    model: Faq,
    publicFields: ['question', 'answer'],
    writableFields: ['question', 'answer'],
    filterFields: [],
    searchFields: ['question', 'answer'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: [],
  },
  links: {
    label: 'Link',
    model: ImportantLink,
    publicFields: ['label', 'description', 'url', 'fileMediaId', 'category'],
    writableFields: ['label', 'description', 'url', 'fileMediaId', 'category'],
    filterFields: ['category'],
    searchFields: ['label', 'description'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: ['fileMediaId'],
  },
  milestones: {
    label: 'Milestone',
    model: HistoryMilestone,
    publicFields: ['periodLabel', 'title', 'text', 'imageMediaId', 'sourceRef'],
    writableFields: ['periodLabel', 'title', 'text', 'imageMediaId', 'sourceRef'],
    filterFields: [],
    searchFields: ['title', 'text', 'periodLabel'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: ['imageMediaId'],
  },
  'committee-terms': {
    label: 'Committee term',
    model: CommitteeTerm,
    publicFields: ['label', 'startYear', 'endYear', 'isCurrent'],
    writableFields: ['label', 'startYear', 'endYear', 'isCurrent'],
    filterFields: [],
    searchFields: ['label'],
    sort: { startYear: -1 },
    mediaFields: [],
  },
  'committee-members': {
    label: 'Committee member',
    model: CommitteeMember,
    publicFields: ['termId', 'name', 'position', 'bio', 'imageMediaId'],
    writableFields: ['termId', 'name', 'position', 'bio', 'imageMediaId'],
    filterFields: ['termId'],
    searchFields: ['name', 'position'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: ['imageMediaId'],
  },
};

export const ContentResourceNames = Object.keys(ContentResources);
