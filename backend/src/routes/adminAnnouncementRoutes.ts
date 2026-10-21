import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  adminAnnouncementListRules,
  announcementIdRules,
  createAnnouncementRules,
  publishAnnouncementRules,
  reorderRules,
  updateAnnouncementRules,
} from '../validators/announcementValidator';
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnnouncement,
  listAdminAnnouncements,
  pinAnnouncement,
  publishAnnouncement,
  reorderAnnouncements,
  unpinAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
} from '../controllers/AnnouncementAdminController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

router.get('/', hasPermission(P.ANNOUNCEMENTS_READ), adminAnnouncementListRules, listAdminAnnouncements);
router.post('/', hasPermission(P.ANNOUNCEMENTS_CREATE), createAnnouncementRules, createAnnouncement);
// Declared before '/:id' so "reorder" is not read as an id.
router.patch('/reorder', hasPermission(P.ANNOUNCEMENTS_PUBLISH), reorderRules, reorderAnnouncements);
router.get('/:id', hasPermission(P.ANNOUNCEMENTS_READ), announcementIdRules, getAdminAnnouncement);
router.patch('/:id', hasPermission(P.ANNOUNCEMENTS_UPDATE), updateAnnouncementRules, updateAnnouncement);
router.delete('/:id', hasPermission(P.ANNOUNCEMENTS_DELETE), announcementIdRules, deleteAnnouncement);

router.post('/:id/publish', hasPermission(P.ANNOUNCEMENTS_PUBLISH), publishAnnouncementRules, publishAnnouncement);
router.post('/:id/unpublish', hasPermission(P.ANNOUNCEMENTS_PUBLISH), announcementIdRules, unpublishAnnouncement);
router.post('/:id/archive', hasPermission(P.ANNOUNCEMENTS_PUBLISH), announcementIdRules, archiveAnnouncement);
router.post('/:id/pin', hasPermission(P.ANNOUNCEMENTS_PUBLISH), announcementIdRules, pinAnnouncement);
router.post('/:id/unpin', hasPermission(P.ANNOUNCEMENTS_PUBLISH), announcementIdRules, unpinAnnouncement);

export default router;
