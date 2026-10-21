import { Router } from 'express';
import optionalSession from '../middlewares/optionalSession';
import { mediaIdRules } from '../validators/mediaValidator';
import { serveMedia } from '../controllers/MediaController';

const router = Router();

// optionalSession lets signed-in staff open staff-only files; visitors still get public ones.
router.get('/:id', optionalSession, mediaIdRules, serveMedia);

export default router;
