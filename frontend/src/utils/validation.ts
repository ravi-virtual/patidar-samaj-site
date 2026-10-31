import { z } from 'zod';

// These rules mirror the server (backend/src/utils/password.ts). They give instant feedback only;
// the API always re-validates, and its response is the source of truth.
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const passwordRule = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain a letter and a number');

const emailRule = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254)
  .pipe(z.email('Enter a valid email address'));

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailRule });
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ password: passwordRule, confirmPassword: z.string().min(1, 'Please confirm your password') })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
