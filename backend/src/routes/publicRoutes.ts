import { Router } from 'express';
import optionalSession from '../middlewares/optionalSession';
import { getHome } from '../controllers/HomeController';
import { getPublicSettings } from '../controllers/SettingsController';

const router = Router();

router.get('/home', optionalSession, getHome);
router.get('/settings', getPublicSettings);

export default router;
