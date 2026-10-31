import { body, param, query } from 'express-validator';
import { AnnouncementCategories, PublishStatus } from '../config/constants';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const idParam = param('id').isUUID().withMessage('Invalid announcement id');

export const announcementIdRules = [idParam, validateRequest];

export const publicAnnouncementListRules = [
  ...paginationRules(50),
  query('category').optional().isIn([...AnnouncementCategories]),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('archived').optional().isBoolean().toBoolean(),
  validateRequest,
];

export const adminAnnouncementListRules = [
  ...paginationRules(100),
  query('status').optional().isIn(Object.values(PublishStatus)),
  query('category').optional().isIn([...AnnouncementCategories]),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

const plain = (field: string, min: number, max: number, required: boolean) => {
  const chain = required ? body(field) : body(field).optional({ values: 'null' });
  return chain
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .isLength({ min: required ? min : 0, max })
    .withMessage(`${field} must be ${min}–${max} characters`)
    // Plain text only: markup is never stored, so it can never be rendered by mistake.
    .matches(/^[^<>]*$/)
    .withMessage(`${field} must not contain < or >`);
};

const fields = (creating: boolean) => [
  plain('title', 3, 150, creating),
  plain('summary', 0, 300, false),
  plain('body', 1, 8000, creating),
  // Gujarati twins: optional, same limits as the English text. Empty means "show the English text".
  plain('titleGu', 0, 150, false),
  plain('summaryGu', 0, 300, false),
  plain('bodyGu', 0, 8000, false),
  body('category').optional().isIn([...AnnouncementCategories]).withMessage('Unknown category'),
  body('publishAt').optional({ values: 'null' }).isISO8601({ strict: true }).withMessage('publishAt must be a valid date and time').toDate(),
  body('featured').optional().isBoolean().toBoolean(),
];

export const createAnnouncementRules = [...fields(true), validateRequest];
export const updateAnnouncementRules = [idParam, ...fields(false), validateRequest];

export const publishAnnouncementRules = [
  idParam,
  body('publishAt').optional({ values: 'null' }).isISO8601({ strict: true }).toDate(),
  validateRequest,
];

export const reorderRules = [
  body('ids')
    .isArray({ min: 1, max: 200 })
    .withMessage('ids must be a list')
    .custom((ids: unknown[]) => ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))
    .withMessage('ids must be valid ids'),
  validateRequest,
];
