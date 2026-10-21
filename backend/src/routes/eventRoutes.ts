import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import optionalSession from '../middlewares/optionalSession';
import hasPermission from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import { eventIdRules, publicEventListRules, rsvpRules } from '../validators/eventValidator';
import { cancelRsvp, getEvent, listEvents, rsvp } from '../controllers/EventController';

const router = Router();

router.get('/', optionalSession, publicEventListRules, listEvents);
router.get('/:id', optionalSession, eventIdRules, getEvent);

router.post('/:id/rsvp', hasToken, isAuthenticated, hasPermission(Permissions.EVENTS_RSVP), rsvpRules, rsvp);
router.delete('/:id/rsvp', hasToken, isAuthenticated, hasPermission(Permissions.EVENTS_RSVP), eventIdRules, cancelRsvp);

export default router;
