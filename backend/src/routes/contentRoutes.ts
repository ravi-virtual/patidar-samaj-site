import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import type { PublicTab } from '../config/publicTabs';
import requireTab from '../middlewares/requireTab';
import { blockKeyRules, publicListRules } from '../validators/contentValidator';
import { getBlock, getCommittee, listBlocks, listContent } from '../controllers/ContentController';

const router = Router();

// Which public tab each list resource belongs to. Unknown resources fall through to validation.
const resourceTab: Record<string, PublicTab> = {
  faqs: 'faq',
  links: 'links',
  'committee-terms': 'committee',
  'committee-members': 'committee',
};
const requireResourceTab = (req: Request, res: Response, next: NextFunction) => {
  const tab = resourceTab[String(req.params.resource)];
  return tab ? requireTab(tab)(req, res, next) : next();
};

// Fixed paths first so they are not mistaken for a :resource.
router.get('/blocks', listBlocks);
router.get('/blocks/:key', blockKeyRules, getBlock);
router.get('/committee', requireTab('committee'), getCommittee);
router.get('/:resource', requireResourceTab, publicListRules, listContent);

export default router;
