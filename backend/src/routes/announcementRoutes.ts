import { Router } from 'express';
import { announcementIdRules, publicAnnouncementListRules } from '../validators/announcementValidator';
import { getAnnouncement, listAnnouncements } from '../controllers/AnnouncementController';

const router = Router();

router.get('/', publicAnnouncementListRules, listAnnouncements);
router.get('/:id', announcementIdRules, getAnnouncement);

export default router;
