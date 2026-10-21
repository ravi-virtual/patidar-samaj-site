import { body, param, query } from 'express-validator';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

export const mediaIdRules = [param('id').isUUID().withMessage('Invalid media id'), validateRequest];

export const mediaListRules = [
  ...paginationRules(100),
  query('kind').optional().isIn(['image', 'document']),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

export const mediaFieldRules = [
  body('altText').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }).matches(/^[^<>]*$/),
  body('visibility').optional().isIn(['public', 'private']),
  validateRequest,
];

export const mediaUpdateRules = [param('id').isUUID().withMessage('Invalid media id'), ...mediaFieldRules];
