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
  registrationIdRules,
  registrationListRules,
  updateEventRules,
} from '../validators/eventValidator';
import {
  archiveEvent,
  cancelEvent,
  createEvent,
  deleteEvent,
  exportRegistrations,
  getAdminEvent,
  listAdminEvents,
  listRegistrations,
  publishEvent,
  removeRegistration,
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

router.get('/:id/registrations', hasPermission(P.REGISTRATIONS_READ), registrationListRules, listRegistrations);
router.get('/:id/registrations/export', hasPermission(P.REGISTRATIONS_EXPORT), eventIdRules, exportRegistrations);
router.delete('/:id/registrations/:registrationId', hasPermission(P.REGISTRATIONS_MANAGE), registrationIdRules, removeRegistration);

export default router;
