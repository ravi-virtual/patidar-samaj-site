import { body, param, query } from 'express-validator';
import { EventCategories, EventStatus } from '../config/constants';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const idParam = param('id').isUUID().withMessage('Invalid event id');

export const eventIdRules = [idParam, validateRequest];

export const publicEventListRules = [
  ...paginationRules(50),
  query('when').optional().isIn(['upcoming', 'past']),
  query('category').optional().isIn([...EventCategories]),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

export const adminEventListRules = [
  ...paginationRules(100),
  query('when').optional().isIn(['upcoming', 'past', 'all']),
  query('status').optional().isIn(Object.values(EventStatus)),
  query('category').optional().isIn([...EventCategories]),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

const plainText = (field: string, min: number, max: number, required: boolean) => {
  const chain = required ? body(field) : body(field).optional({ values: 'null' });
  return chain
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .isLength({ min: required ? min : 0, max })
    .withMessage(`${field} must be ${min}–${max} characters`)
    .matches(/^[^<>]*$/)
    .withMessage(`${field} contains invalid characters`);
};

const dateField = (field: string, required: boolean) => {
  const chain = required ? body(field) : body(field).optional({ values: 'null' });
  return chain.isISO8601({ strict: true }).withMessage(`${field} must be a valid date and time`).toDate();
};

const eventFields = (creating: boolean) => [
  plainText('title', 3, 150, creating),
  plainText('description', 0, 4000, false),
  plainText('venue', 2, 200, creating),
  body('category').optional().isIn([...EventCategories]).withMessage('Unknown category'),
  dateField('startsAt', creating),
  dateField('endsAt', false),
  body('featured').optional().isBoolean().toBoolean(),
  body('imageMediaId').optional({ values: 'null' }).isUUID(),
  // Cross-field rules, evaluated once all single-field rules have passed.
  body().custom((value: Record<string, unknown>) => {
    const asDate = (v: unknown) => (v instanceof Date ? v : undefined);
    const starts = asDate(value.startsAt);
    const ends = asDate(value.endsAt);
    if (starts && ends && ends < starts) throw new Error('The end time must be after the start time');
    return true;
  }),
];

export const createEventRules = [...eventFields(true), validateRequest];
export const updateEventRules = [idParam, ...eventFields(false), validateRequest];

export const cancelEventRules = [
  idParam,
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  validateRequest,
];
