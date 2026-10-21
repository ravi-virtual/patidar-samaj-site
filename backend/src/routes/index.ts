import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import memberRoutes from './memberRoutes';
import adminMemberRoutes from './adminMemberRoutes';
import eventRoutes from './eventRoutes';
import adminEventRoutes from './adminEventRoutes';
import announcementRoutes from './announcementRoutes';
import adminAnnouncementRoutes from './adminAnnouncementRoutes';
import contentRoutes from './contentRoutes';
import adminContentRoutes from './adminContentRoutes';
import contactRoutes from './contactRoutes';
import adminContactRoutes from './adminContactRoutes';
import mediaRoutes from './mediaRoutes';
import adminMediaRoutes from './adminMediaRoutes';
import publicRoutes from './publicRoutes';
import optionalSession from '../middlewares/optionalSession';
import { searchRules } from '../validators/settingsValidator';
import { search } from '../controllers/HomeController';
import adminRoutes from './adminRoutes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/members', memberRoutes);
router.use('/admin/members', adminMemberRoutes);
router.use('/events', eventRoutes);
router.use('/admin/events', adminEventRoutes);
router.use('/announcements', announcementRoutes);
router.use('/admin/announcements', adminAnnouncementRoutes);
router.use('/content', contentRoutes);
router.use('/admin/content', adminContentRoutes);
router.use('/contact', contactRoutes);
router.use('/admin/contacts', adminContactRoutes);
router.use('/media', mediaRoutes);
router.use('/admin/media', adminMediaRoutes);
router.use('/public', publicRoutes);
router.get('/search', optionalSession, searchRules, search);
// Dashboard, audit log and settings (mounted last so the more specific /admin/* paths above win).
router.use('/admin', adminRoutes);

export default router;
