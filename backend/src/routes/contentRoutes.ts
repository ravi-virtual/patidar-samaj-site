import { Router } from 'express';
import { blockKeyRules, publicListRules } from '../validators/contentValidator';
import { getBlock, getCommittee, listBlocks, listContent } from '../controllers/ContentController';

const router = Router();

// Fixed paths first so they are not mistaken for a :resource.
router.get('/blocks', listBlocks);
router.get('/blocks/:key', blockKeyRules, getBlock);
router.get('/committee', getCommittee);
router.get('/:resource', publicListRules, listContent);

export default router;
