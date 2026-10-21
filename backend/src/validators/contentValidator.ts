import type { NextFunction, Request, Response } from 'express';
import { body, param, query, type ValidationChain } from 'express-validator';
import { LinkCategories, PublishStatus } from '../config/constants';
import { ContentResourceNames } from '../config/contentResources';
import { ContentKeys } from '../models/ContentBlock';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const plain = (field: string, min: number, max: number, required: boolean): ValidationChain => {
  const chain = required ? body(field) : body(field).optional({ values: 'null' });
  return chain
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .isLength({ min: required ? min : 0, max })
    .withMessage(`${field} must be ${min}–${max} characters`)
    // Plain text only; markup is rejected so nothing stored can ever be rendered as HTML.
    .matches(/^[^<>]*$/)
    .withMessage(`${field} must not contain < or >`);
};

const mediaId = (field: string) => body(field).optional({ values: 'null' }).isUUID().withMessage(`${field} must be a media id`);

/** Only http(s) addresses without embedded credentials. javascript:, data:, file: and the like fail. */
const safeUrl = body('url')
  .optional({ values: 'falsy' })
  .isString()
  .trim()
  .isLength({ max: 500 })
  .isURL({ protocols: ['http', 'https'], require_protocol: true, require_tld: true, disallow_auth: true })
  .withMessage('Enter a full web address starting with http:// or https://');

const resourceRules = (creating: boolean): Record<string, ValidationChain[]> => ({
  faqs: [plain('question', 5, 200, creating), plain('answer', 1, 2000, creating)],
  links: [
    plain('label', 3, 120, creating),
    plain('description', 0, 200, false),
    safeUrl,
    mediaId('fileMediaId'),
    body('category').optional().isIn([...LinkCategories]).withMessage('Unknown category'),
  ],
  milestones: [
    plain('periodLabel', 1, 40, creating),
    plain('title', 3, 150, creating),
    plain('text', 1, 1500, creating),
    plain('sourceRef', 0, 200, false),
    mediaId('imageMediaId'),
  ],
  'committee-terms': [
    plain('label', 1, 40, creating),
    (creating ? body('startYear') : body('startYear').optional()).isInt({ min: 1900, max: 2200 }).toInt(),
    (creating ? body('endYear') : body('endYear').optional()).isInt({ min: 1900, max: 2200 }).toInt(),
    body('isCurrent').optional().isBoolean().toBoolean(),
    body().custom((v: Record<string, unknown>) => {
      if (typeof v.startYear === 'number' && typeof v.endYear === 'number' && v.endYear < v.startYear) {
        throw new Error('The end year must not be before the start year');
      }
      return true;
    }),
  ],
  'committee-members': [
    (creating ? body('termId') : body('termId').optional()).isUUID().withMessage('Choose a committee term'),
    plain('name', 2, 100, creating),
    plain('position', 1, 80, creating),
    plain('bio', 0, 800, false),
    mediaId('imageMediaId'),
  ],
});

const createRules = resourceRules(true);
const updateRules = resourceRules(false);

/** Runs the rule set that belongs to the :resource in the URL. */
const forResource =
  (rules: Record<string, ValidationChain[]>) => async (req: Request, res: Response, next: NextFunction) => {
    const chains = rules[String(req.params.resource)] ?? [];
    for (const chain of chains) await chain.run(req);
    return validateRequest(req, res, next);
  };

const resourceParam = param('resource').isIn(ContentResourceNames).withMessage('Unknown content type');
const idParam = param('id').isUUID().withMessage('Invalid id');

export const resourceNameRules = [resourceParam, validateRequest];
export const itemRules = [resourceParam, idParam, validateRequest];

export const publicListRules = [
  resourceParam,
  query('category').optional().isIn([...LinkCategories]),
  query('termId').optional().isUUID(),
  validateRequest,
];

export const adminListRules = [
  resourceParam,
  ...paginationRules(100),
  query('status').optional().isIn(Object.values(PublishStatus)),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('category').optional().isIn([...LinkCategories]),
  query('termId').optional().isUUID(),
  validateRequest,
];

export const createItemRules = [resourceParam, validateRequest, forResource(createRules)];
export const updateItemRules = [resourceParam, idParam, validateRequest, forResource(updateRules)];

export const reorderItemRules = [
  resourceParam,
  body('ids')
    .isArray({ min: 1, max: 500 })
    .custom((ids: unknown[]) => ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))
    .withMessage('ids must be a list of valid ids'),
  validateRequest,
];

export const blockKeyRules = [param('key').isIn([...ContentKeys]).withMessage('Unknown content block'), validateRequest];

export const blockBodyRules = [
  param('key').isIn([...ContentKeys]).withMessage('Unknown content block'),
  plain('title', 0, 150, false),
  plain('body', 0, 6000, false),
  body('items').optional().isArray({ max: 20 }).withMessage('At most 20 items'),
  body('items.*.title').optional().isString().trim().isLength({ max: 120 }).matches(/^[^<>]*$/),
  body('items.*.text').optional().isString().trim().isLength({ max: 600 }).matches(/^[^<>]*$/),
  body('items.*.value').optional().isString().trim().isLength({ max: 40 }).matches(/^[^<>]*$/),
  body('items.*.label').optional().isString().trim().isLength({ max: 120 }).matches(/^[^<>]*$/),
  body('items.*.imageMediaId').optional({ values: 'null' }).isUUID(),
  validateRequest,
];
