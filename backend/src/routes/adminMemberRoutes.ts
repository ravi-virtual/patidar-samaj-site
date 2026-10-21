import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission, { hasAnyPermission } from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  adminListRules,
  createMemberRules,
  memberIdRules,
  updateMemberRules,
} from '../validators/memberValidator';
import {
  anonymizeMember,
  createMember,
  exportMembers,
  listMembers,
  updateMember,
} from '../controllers/MemberAdminController';

const router = Router();
const P = Permissions;

// Staff only: members hold members.read for the directory, which must never open admin routes.
router.use(hasToken, isAuthenticated, isStaff);

router.get('/', hasAnyPermission(P.MEMBERS_READ, P.USERS_READ), adminListRules, listMembers);
router.get('/export', hasPermission(P.MEMBERS_EXPORT), adminListRules, exportMembers);
router.post('/', hasPermission(P.MEMBERS_CREATE), createMemberRules, createMember);
router.patch('/:id', hasPermission(P.MEMBERS_UPDATE), updateMemberRules, updateMember);
router.post('/:id/anonymize', hasPermission(P.MEMBERS_ANONYMIZE), memberIdRules, anonymizeMember);

export default router;
