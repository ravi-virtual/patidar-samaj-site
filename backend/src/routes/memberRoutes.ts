import { Router } from 'express';
import { listMyRegistrations } from '../controllers/EventController';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import optionalSession from '../middlewares/optionalSession';
import {
  directoryQueryRules,
  memberIdRules,
  updateOwnProfileRules,
} from '../validators/memberValidator';
import {
  getMember,
  getMyProfile,
  listDirectory,
  listDirectoryFilters,
  updateMyProfile,
} from '../controllers/MemberController';

const router = Router();

// Directory: visible to visitors only for entries marked public; members see more.
router.get('/', optionalSession, directoryQueryRules, listDirectory);
router.get('/filters', optionalSession, listDirectoryFilters);

// Own profile (declared before '/:id' so "me" is not read as an id).
router.get('/me', hasToken, isAuthenticated, getMyProfile);
router.patch('/me', hasToken, isAuthenticated, updateOwnProfileRules, updateMyProfile);

router.get('/me/registrations', hasToken, isAuthenticated, listMyRegistrations);

router.get('/:id', optionalSession, memberIdRules, getMember);

export default router;
