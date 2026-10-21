import { body, param, query } from 'express-validator';
import { ContactStatus, ContactTopics } from '../config/constants';
import { paginationRules } from '../utils/pagination';
import { validateRequest } from './validateRequest';

const idParam = param('id').isUUID().withMessage('Invalid message id');

export const submitContactRules = [
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2–100 characters')
    .matches(/^[^<>]+$/)
    .withMessage('Name contains invalid characters'),
  body('email')
    .isString()
    .withMessage('Email is required')
    .bail()
    .trim()
    .isLength({ max: 254 })
    .isEmail()
    .withMessage('Enter a valid email address')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('topic').optional().isIn([...ContactTopics]).withMessage('Choose one of the listed topics'),
  body('message')
    .isString()
    .withMessage('Message is required')
    .bail()
    .trim()
    .isLength({ min: 10, max: 4000 })
    .withMessage('Message must be 10–4000 characters')
    .matches(/^[^<>]+$/)
    .withMessage('Message must not contain < or >'),
  // Honeypot: real people never see or fill this field. Left unvalidated on purpose.
  body('website').optional().isString().isLength({ max: 500 }),
  validateRequest,
];

export const contactIdRules = [idParam, validateRequest];

export const contactListRules = [
  ...paginationRules(100),
  query('status').optional().isIn(Object.values(ContactStatus)),
  query('assignedTo').optional().isUUID(),
  query('mine').optional().isBoolean().toBoolean(),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  validateRequest,
];

export const updateContactRules = [
  idParam,
  body('status').optional().isIn(Object.values(ContactStatus)).withMessage('Unknown status'),
  body('assignedTo').optional({ values: 'null' }).isUUID().withMessage('Choose a staff member'),
  validateRequest,
];

export const contactNoteRules = [
  idParam,
  body('text')
    .isString()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note must be 1–1000 characters')
    .matches(/^[^<>]+$/)
    .withMessage('Note must not contain < or >'),
  validateRequest,
];
