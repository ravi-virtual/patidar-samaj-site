import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import hasPermission, { hasAnyPermission } from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  changeRoleRules,
  createStaffRules,
  listUsersRules,
  reasonRules,
  userIdRules,
} from '../validators/userValidator';
import {
  approveUser,
  changeRole,
  createStaff,
  issuePasswordReset,
  listUsers,
  reactivateUser,
  rejectUser,
  revokeUserSessionsAction,
  suspendUser,
} from '../controllers/UserController';

const router = Router();
const P = Permissions;

// Every route is authenticated; each adds the permission it needs. Object-level checks
// (staff vs member targets, last Super Admin, self-service limits) are in the controller.
router.use(hasToken, isAuthenticated);

router.get('/', hasPermission(P.USERS_READ), listUsersRules, listUsers);
router.post('/', hasPermission(P.USERS_MANAGE), createStaffRules, createStaff);

router.post('/:id/approve', hasPermission(P.MEMBERS_APPROVE), userIdRules, approveUser);
router.post('/:id/reject', hasPermission(P.MEMBERS_APPROVE), reasonRules, rejectUser);
router.post('/:id/suspend', hasAnyPermission(P.MEMBERS_SUSPEND, P.USERS_MANAGE), reasonRules, suspendUser);
router.post('/:id/reactivate', hasAnyPermission(P.MEMBERS_SUSPEND, P.USERS_MANAGE), userIdRules, reactivateUser);
router.patch('/:id/role', hasPermission(P.ROLES_MANAGE), changeRoleRules, changeRole);
router.post('/:id/revoke-sessions', hasPermission(P.SESSIONS_REVOKE), userIdRules, revokeUserSessionsAction);
router.post('/:id/password-reset', hasPermission(P.USERS_RESET_PASSWORD), userIdRules, issuePasswordReset);

export default router;
