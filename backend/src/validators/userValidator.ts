import { body, param, query } from 'express-validator';
import { AccountStatus, Roles } from '../config/constants';
import { GRANTABLE_PERMISSIONS } from '../config/permissions';
import { validateRequest } from './validateRequest';

const idParam = param('id').isUUID().withMessage('Invalid user id');

export const listUsersRules = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('role').optional().isIn(Object.values(Roles)),
  query('status').optional().isIn(Object.values(AccountStatus)),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

export const userIdRules = [idParam, validateRequest];

export const createStaffRules = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[^<>]+$/)
    .withMessage('Name must be 2–100 characters'),
  body('email')
    .isString()
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('role')
    .isString()
    .isIn([Roles.ADMIN, Roles.EDITOR, Roles.VIEWER])
    .withMessage('Role must be admin, editor or viewer'),
  validateRequest,
];

export const changeRoleRules = [
  idParam,
  body('role').isString().isIn(Object.values(Roles)).withMessage('Unknown role'),
  body('extraPermissions')
    .optional()
    .isArray({ max: 10 })
    .custom((list: unknown[]) => list.every((p) => GRANTABLE_PERMISSIONS.includes(p as never)))
    .withMessage('One or more permissions cannot be granted individually'),
  validateRequest,
];

export const reasonRules = [
  idParam,
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  validateRequest,
];
