import { body, param, query } from 'express-validator';
import { AccountStatus, Roles } from '../config/constants';
import { SELECTABLE_PERMISSIONS } from '../config/permissions';
import { validatePasswordStrength } from '../utils/password';
import { validateRequest } from './validateRequest';

// The permissions the Super Admin ticks for an admin. Only the selectable catalog, each at most once.
const permissionsRule = (optional: boolean) => {
  const chain = body('permissions');
  return (optional ? chain.optional() : chain)
    .isArray({ max: SELECTABLE_PERMISSIONS.length })
    .withMessage('permissions must be a list')
    .bail()
    .custom(
      (list: unknown[]) =>
        list.every((p) => typeof p === 'string' && (SELECTABLE_PERMISSIONS as readonly string[]).includes(p)) &&
        new Set(list).size === list.length,
    )
    .withMessage('Permissions must come from the selectable list and be listed once');
};

const nameRule = (optional: boolean) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain)
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[^<>]+$/)
    .withMessage('Name must be 2–100 characters');
};

const idParam = param('id').isUUID().withMessage('Invalid user id');

export const listUsersRules = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(Object.values(AccountStatus)),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

export const userIdRules = [idParam, validateRequest];

export const createAdminRules = [
  nameRule(false),
  body('email')
    .isString()
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  // The role is always "admin". Anything else (the Super Admin in particular) is refused.
  body('role').optional().equals(Roles.ADMIN).withMessage('Only admin accounts can be created here'),
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .custom((value: string, { req }) => {
      const problem = validatePasswordStrength(value, typeof req.body?.email === 'string' ? req.body.email : undefined);
      if (problem) throw new Error(problem);
      return true;
    }),
  permissionsRule(true),
  validateRequest,
];

/** Editing an admin means name and/or permissions. At least one must be sent. */
export const updateAdminRules = [
  idParam,
  nameRule(true),
  permissionsRule(true),
  body().custom((value: Record<string, unknown>) => {
    if (value?.name === undefined && value?.permissions === undefined) throw new Error('Send a name or permissions to change');
    return true;
  }),
  validateRequest,
];

export const reasonRules = [
  idParam,
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  validateRequest,
];

/** The new password an administrator sets directly for another admin. */
export const resetPasswordRules = [
  idParam,
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .custom((value: string) => {
      const problem = validatePasswordStrength(value);
      if (problem) throw new Error(problem);
      return true;
    }),
  validateRequest,
];
