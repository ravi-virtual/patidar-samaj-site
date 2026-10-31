import { body, param, query } from 'express-validator';
import { MemberVisibility, MembershipStatus } from '../config/constants';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const text = (field: string, max: number) =>
  body(field)
    .optional({ values: 'null' })
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .isLength({ max })
    .withMessage(`${field} must be at most ${max} characters`)
    .matches(/^[^<>]*$/)
    .withMessage(`${field} contains invalid characters`);

const phone = body('phone')
  .optional({ values: 'falsy' })
  .isString()
  .trim()
  .matches(/^\+?[0-9 ()-]{7,20}$/)
  .withMessage('Enter a valid phone number');

const familySize = body('familySize')
  .optional({ values: 'null' })
  .isInt({ min: 1, max: 40 })
  .withMessage('Family size must be between 1 and 40')
  .toInt();

const visibility = body('visibility')
  .optional()
  .isIn(Object.values(MemberVisibility))
  .withMessage('Visibility must be hidden or public');

const profileFields = [
  text('village', 80),
  text('city', 80),
  text('country', 80),
  text('occupation', 100),
  text('kul', 80),
  text('bio', 500),
  familySize,
  phone,
  visibility,
];

export const directoryQueryRules = [
  ...paginationRules(50),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('village').optional().isString().trim().isLength({ max: 80 }),
  query('city').optional().isString().trim().isLength({ max: 80 }),
  query('country').optional().isString().trim().isLength({ max: 80 }),
  query('sort').optional().isIn(['name', '-name', 'village', 'city']),
  validateRequest,
];

export const memberIdRules = [param('id').isUUID().withMessage('Invalid member id'), validateRequest];

export const adminListRules = [
  ...paginationRules(100),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('membershipStatus').optional().isIn(Object.values(MembershipStatus)),
  query('visibility').optional().isIn(Object.values(MemberVisibility)),
  query('village').optional().isString().trim().isLength({ max: 80 }),
  validateRequest,
];

export const createMemberRules = [
  body('displayName')
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[^<>]+$/)
    .withMessage('Name must be 2–100 characters'),
  ...profileFields,
  body('joinedYear').optional({ values: 'null' }).isInt({ min: 1900, max: 2200 }).toInt(),
  body('membershipStatus').optional().isIn([MembershipStatus.ACTIVE, MembershipStatus.INACTIVE]),
  body('highlighted').optional().isBoolean().toBoolean(),
  validateRequest,
];

export const updateMemberRules = [
  param('id').isUUID().withMessage('Invalid member id'),
  body('displayName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[^<>]+$/)
    .withMessage('Name must be 2–100 characters'),
  ...profileFields,
  body('joinedYear').optional({ values: 'null' }).isInt({ min: 1900, max: 2200 }).toInt(),
  body('membershipStatus').optional().isIn([MembershipStatus.ACTIVE, MembershipStatus.INACTIVE]),
  body('highlighted').optional().isBoolean().toBoolean(),
  validateRequest,
];
