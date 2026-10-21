import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import { authRateLimiter } from '../middlewares/rateLimiter';
import {
  changePasswordRules,
  forgotPasswordRules,
  loginRules,
  registerRules,
  resetPasswordRules,
  themeRules,
} from '../validators/authValidator';
import {
  changePassword,
  forgotPassword,
  getMe,
  listSessions,
  login,
  logout,
  register,
  resetPassword,
  revokeSession,
  updateTheme,
} from '../controllers/AuthController';

const router = Router();

// Public (stricter rate limit)
router.post('/register', authRateLimiter, registerRules, register);
router.post('/login', authRateLimiter, loginRules, login);
router.post('/forgot-password', authRateLimiter, forgotPasswordRules, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPasswordRules, resetPassword);

// Signed-in users. hasToken also enforces the CSRF token on POST/PATCH/DELETE.
router.get('/me', hasToken, isAuthenticated, getMe);
router.post('/logout', hasToken, isAuthenticated, logout);
router.patch('/me/theme', hasToken, isAuthenticated, themeRules, updateTheme);
router.post('/change-password', hasToken, isAuthenticated, changePasswordRules, changePassword);
router.get('/sessions', hasToken, isAuthenticated, listSessions);
router.delete('/sessions/:id', hasToken, isAuthenticated, revokeSession);

export default router;
