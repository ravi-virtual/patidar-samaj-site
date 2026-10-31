import { Router } from 'express';
import requireTab from '../middlewares/requireTab';
import { announcementIdRules, publicAnnouncementListRules } from '../validators/announcementValidator';
import { getAnnouncement, listAnnouncements } from '../controllers/AnnouncementController';

const router = Router();

router.get('/', requireTab('news'), publicAnnouncementListRules, listAnnouncements);
router.get('/:id', requireTab('news'), announcementIdRules, getAnnouncement);

export default router;
