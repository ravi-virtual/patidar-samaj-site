import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  adminEventListRules,
  cancelEventRules,
  createEventRules,
  eventIdRules,
  updateEventRules,
} from '../validators/eventValidator';
import {
  archiveEvent,
  cancelEvent,
  createEvent,
  deleteEvent,
  getAdminEvent,
  listAdminEvents,
  publishEvent,
  unpublishEvent,
  updateEvent,
} from '../controllers/EventAdminController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

router.get('/', hasPermission(P.EVENTS_READ), adminEventListRules, listAdminEvents);
router.post('/', hasPermission(P.EVENTS_CREATE), createEventRules, createEvent);
router.get('/:id', hasPermission(P.EVENTS_READ), eventIdRules, getAdminEvent);
router.patch('/:id', hasPermission(P.EVENTS_UPDATE), updateEventRules, updateEvent);
router.delete('/:id', hasPermission(P.EVENTS_DELETE), eventIdRules, deleteEvent);

router.post('/:id/publish', hasPermission(P.EVENTS_PUBLISH), eventIdRules, publishEvent);
router.post('/:id/unpublish', hasPermission(P.EVENTS_PUBLISH), eventIdRules, unpublishEvent);
router.post('/:id/cancel', hasPermission(P.EVENTS_PUBLISH), cancelEventRules, cancelEvent);
router.post('/:id/archive', hasPermission(P.EVENTS_PUBLISH), eventIdRules, archiveEvent);

export default router;
