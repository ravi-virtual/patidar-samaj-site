import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import { authRateLimiter } from '../middlewares/rateLimiter';
import {
  changePasswordRules,
  forgotPasswordRules,
  loginRules,
  resetPasswordRules,
  themeRules,
  userIdRules,
} from '../validators/authValidator';
import {
  adminLogin,
  changePassword,
  forgotPassword,
  getUserById,
  listSessions,
  logout,
  resetPassword,
  revokeSession,
  updateUserThemeById,
} from '../controllers/AuthController';

const router = Router();

// Public (stricter rate limit). There is no registration and no member sign-in: admins only.
router.post('/admin-login', authRateLimiter, loginRules, adminLogin);
router.post('/forgot-password', authRateLimiter, forgotPasswordRules, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPasswordRules, resetPassword);

// Signed-in users. hasToken also enforces the CSRF token on POST/PATCH/DELETE.
router.post('/logout', hasToken, isAuthenticated, logout);
router.post('/change-password', hasToken, isAuthenticated, changePasswordRules, changePassword);
router.get('/sessions', hasToken, isAuthenticated, listSessions);
router.delete('/sessions/:id', hasToken, isAuthenticated, revokeSession);
// A user can only read or change their own record; declared last so fixed paths above win.
router.get('/:id', hasToken, isAuthenticated, userIdRules, getUserById);
router.patch('/:id/theme', hasToken, isAuthenticated, themeRules, updateUserThemeById);

export default router;
