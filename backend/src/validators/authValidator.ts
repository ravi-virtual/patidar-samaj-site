import { body } from 'express-validator';
import { ThemePreferences } from '../config/constants';
import { validatePasswordStrength } from '../utils/password';
import { validateRequest } from './validateRequest';

export const emailRule = body('email')
  .isString()
  .withMessage('Email is required')
  .bail()
  .trim()
  .isLength({ max: 254 })
  .isEmail()
  .withMessage('Enter a valid email address')
  .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false });

const newPasswordRule = (field: string, emailField = 'email') =>
  body(field)
    .isString()
    .withMessage('Password is required')
    .bail()
    .custom((value: string, { req }) => {
      const email = typeof req.body?.[emailField] === 'string' ? req.body[emailField] : undefined;
      const problem = validatePasswordStrength(value, email);
      if (problem) throw new Error(problem);
      return true;
    });

export const loginRules = [
  body('email').isString().trim().notEmpty().withMessage('Email is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
  validateRequest,
];

export const forgotPasswordRules = [emailRule, validateRequest];

export const resetPasswordRules = [
  body('token').isString().isLength({ min: 20, max: 128 }).withMessage('Reset link is invalid'),
  newPasswordRule('password', 'none'),
  body('confirmPassword')
    .isString()
    .custom((value: string, { req }) => value === req.body?.password)
    .withMessage('Passwords do not match'),
  validateRequest,
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  newPasswordRule('newPassword', 'none'),
  body('confirmPassword')
    .isString()
    .custom((value: string, { req }) => value === req.body?.newPassword)
    .withMessage('Passwords do not match'),
  validateRequest,
];

export const themeRules = [
  body('themePreference')
    .isString()
    .isIn([...ThemePreferences])
    .withMessage('Theme must be system, light or dark'),
  validateRequest,
];
