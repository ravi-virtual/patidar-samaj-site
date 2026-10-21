import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission, { hasAnyPermission } from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  contactIdRules,
  contactListRules,
  contactNoteRules,
  updateContactRules,
} from '../validators/contactValidator';
import { addContactNote, getContact, listContacts, updateContact } from '../controllers/ContactAdminController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

router.get('/', hasPermission(P.CONTACTS_READ), contactListRules, listContacts);
router.get('/:id', hasPermission(P.CONTACTS_READ), contactIdRules, getContact);
// The controller checks which of status / assignee are being changed against resolve / assign.
router.patch('/:id', hasAnyPermission(P.CONTACTS_RESOLVE, P.CONTACTS_ASSIGN), updateContactRules, updateContact);
router.post('/:id/notes', hasPermission(P.CONTACTS_RESOLVE), contactNoteRules, addContactNote);

export default router;
