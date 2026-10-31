import { Router } from 'express';
import requireTab from '../middlewares/requireTab';
import { eventIdRules, publicEventListRules } from '../validators/eventValidator';
import { getEvent, listEvents } from '../controllers/EventController';

const router = Router();

router.get('/', requireTab('events'), publicEventListRules, listEvents);
router.get('/:id', requireTab('events'), eventIdRules, getEvent);

export default router;
