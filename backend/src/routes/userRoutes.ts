import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isSuperAdmin from '../middlewares/isSuperAdmin';
import hasPermission, { hasAnyPermission } from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  createAdminRules,
  listUsersRules,
  reasonRules,
  resetPasswordRules,
  updateAdminRules,
  userIdRules,
} from '../validators/userValidator';
import {
  createAdmin,
  deleteAdmin,
  getAdmin,
  listUsers,
  reactivateUser,
  resetAdminPassword,
  revokeUserSessionsAction,
  suspendUser,
  updateAdmin,
} from '../controllers/UserController';

const router = Router();
const P = Permissions;

// The Super Admin manages admin accounts. An admin holding `users.reset_password` may also list
// admins and set another admin's password directly. Every other route is Super-Admin-only
// (isSuperAdmin is an explicit role check; each route also names the permission it needs).
router.use(hasToken, isAuthenticated);

router.get('/', hasAnyPermission(P.USERS_READ, P.USERS_RESET_PASSWORD), listUsersRules, listUsers);
router.get('/:id', isSuperAdmin, hasPermission(P.USERS_MANAGE), userIdRules, getAdmin);
router.post('/', isSuperAdmin, hasPermission(P.USERS_MANAGE), createAdminRules, createAdmin);
router.patch('/:id', isSuperAdmin, hasPermission(P.USERS_MANAGE), updateAdminRules, updateAdmin);
router.delete('/:id', isSuperAdmin, hasPermission(P.USERS_MANAGE), userIdRules, deleteAdmin);
router.post('/:id/suspend', isSuperAdmin, hasPermission(P.USERS_MANAGE), reasonRules, suspendUser);
router.post('/:id/reactivate', isSuperAdmin, hasPermission(P.USERS_MANAGE), userIdRules, reactivateUser);
router.post('/:id/revoke-sessions', isSuperAdmin, hasPermission(P.SESSIONS_REVOKE), userIdRules, revokeUserSessionsAction);
router.post('/:id/password-reset', hasPermission(P.USERS_RESET_PASSWORD), resetPasswordRules, resetAdminPassword);

export default router;
