import { Router } from 'express';
import requireTab from '../middlewares/requireTab';
import { directoryQueryRules, memberIdRules } from '../validators/memberValidator';
import { getMember, listDirectory, listDirectoryFilters } from '../controllers/MemberController';

const router = Router();

// Public directory: 404 while the "Members directory" tab is off. Everyone sees only entries marked public.
router.get('/', requireTab('directory'), directoryQueryRules, listDirectory);
router.get('/filters', requireTab('directory'), listDirectoryFilters);
router.get('/:id', requireTab('directory'), memberIdRules, getMember);

export default router;
