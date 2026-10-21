import { body, query } from 'express-validator';
import { ThemePreferences } from '../config/constants';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const text = (path: string, max: number) =>
  body(path)
    .optional({ values: 'null' })
    .isString()
    .withMessage(`${path} must be text`)
    .bail()
    .trim()
    .isLength({ max })
    .withMessage(`${path} must be at most ${max} characters`)
    .matches(/^[^<>]*$/)
    .withMessage(`${path} must not contain < or >`);

const webAddress = (path: string) =>
  body(path)
    .isString()
    .trim()
    .isLength({ max: 500 })
    .isURL({ protocols: ['http', 'https'], require_protocol: true, require_tld: true, disallow_auth: true })
    .withMessage('Enter a full web address starting with http:// or https://');

export const updateSettingsRules = [
  text('name', 150),
  text('shortName', 80),
  text('invocation', 80),
  text('tagline', 200),
  text('footerNote', 400),
  body('logoMediaId').optional({ values: 'null' }).isUUID().withMessage('logoMediaId must be a media id'),
  body('contact').optional().isObject().withMessage('contact must be an object'),
  body('contact.email')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isEmail()
    .withMessage('Enter a valid contact email'),
  text('contact.phone', 30),
  text('contact.address', 400),
  text('contact.officeHours', 200),
  body('socialLinks').optional().isArray({ max: 8 }).withMessage('At most 8 social links'),
  text('socialLinks.*.label', 40),
  body('socialLinks.*.label').optional().isString().trim().isLength({ min: 1 }).withMessage('Each link needs a label'),
  webAddress('socialLinks.*.url').optional(),
  body('registrationOpen').optional().isBoolean().toBoolean(),
  body('directoryPublic').optional().isBoolean().toBoolean(),
  body('themeDefault').optional().isIn([...ThemePreferences]),
  validateRequest,
];

export const auditListRules = [
  ...paginationRules(100),
  query('action').optional().isString().trim().isLength({ max: 80 }).matches(/^[a-zA-Z0-9._*-]+$/),
  query('actorId').optional().isUUID(),
  query('outcome').optional().isIn(['success', 'failure']),
  query('targetType').optional().isString().trim().isLength({ max: 40 }).matches(/^[a-zA-Z0-9._-]+$/),
  query('from').optional().isISO8601({ strict: true }).toDate(),
  query('to').optional().isISO8601({ strict: true }).toDate(),
  validateRequest,
];

export const searchRules = [
  query('q').isString().withMessage('Enter something to search for').bail().trim().isLength({ min: 2, max: 100 }).withMessage('Search must be 2–100 characters'),
  validateRequest,
];
