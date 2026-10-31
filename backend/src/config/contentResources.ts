import type { Model } from 'mongoose';
import { guField } from '../utils/localize';
import Faq from '../models/Faq';
import ImportantLink from '../models/ImportantLink';
import HistoryMilestone from '../models/HistoryMilestone';
import CommitteeTerm from '../models/CommitteeTerm';
import CommitteeMember from '../models/CommitteeMember';

export interface ContentResource {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one registry serves several schemas
  model: Model<any>;
  /** The only fields included in public responses (plus the id). Nothing else is ever sent. Gujarati twins are listed so they can be localized, then removed. */
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

/**
 * The fields of a list that have a Gujarati twin (`question` when `questionGu` is listed too).
 * Public responses localize exactly these and drop the twins.
 */
export const translatedFieldsOf = (fields: readonly string[]): string[] => fields.filter((f) => fields.includes(guField(f)));

// To add another simple, orderable, publishable content type: add a model, an entry here and a
// validation rule set in validators/contentValidator.ts. Controllers and routes need no changes.
export const ContentResources: Record<string, ContentResource> = {
  faqs: {
    label: 'FAQ',
    model: Faq,
    publicFields: ['question', 'answer', 'questionGu', 'answerGu'],
    writableFields: ['question', 'answer', 'questionGu', 'answerGu'],
    filterFields: [],
    searchFields: ['question', 'answer', 'questionGu', 'answerGu'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: [],
  },
  links: {
    label: 'Link',
    model: ImportantLink,
    publicFields: ['label', 'description', 'labelGu', 'descriptionGu', 'url', 'fileMediaId', 'category'],
    writableFields: ['label', 'description', 'labelGu', 'descriptionGu', 'url', 'fileMediaId', 'category'],
    filterFields: ['category'],
    searchFields: ['label', 'description', 'labelGu', 'descriptionGu'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: ['fileMediaId'],
  },
  milestones: {
    label: 'Milestone',
    model: HistoryMilestone,
    publicFields: ['periodLabel', 'title', 'text', 'imageMediaId', 'sourceRef', 'periodLabelGu', 'titleGu', 'textGu', 'sourceRefGu'],
    writableFields: ['periodLabel', 'title', 'text', 'imageMediaId', 'sourceRef', 'periodLabelGu', 'titleGu', 'textGu', 'sourceRefGu'],
    filterFields: [],
    searchFields: ['title', 'text', 'periodLabel', 'titleGu', 'textGu', 'periodLabelGu'],
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
    publicFields: ['termId', 'name', 'position', 'bio', 'nameGu', 'positionGu', 'bioGu', 'imageMediaId'],
    writableFields: ['termId', 'name', 'position', 'bio', 'nameGu', 'positionGu', 'bioGu', 'imageMediaId'],
    filterFields: ['termId'],
    searchFields: ['name', 'position', 'nameGu', 'positionGu'],
    sort: { order: 1, createdAt: 1 },
    mediaFields: ['imageMediaId'],
  },
};

export const ContentResourceNames = Object.keys(ContentResources);
