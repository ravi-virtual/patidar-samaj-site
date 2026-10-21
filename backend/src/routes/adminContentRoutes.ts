import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import {
  adminListRules,
  blockBodyRules,
  blockKeyRules,
  createItemRules,
  itemRules,
  reorderItemRules,
  updateItemRules,
} from '../validators/contentValidator';
import {
  archiveItem,
  createItem,
  deleteItem,
  getItem,
  listAdminBlocks,
  listItems,
  publishBlock,
  publishItem,
  reorderItems,
  saveBlock,
  unpublishBlock,
  unpublishItem,
  updateItem,
} from '../controllers/ContentAdminController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

// Text blocks (fixed paths before :resource).
router.get('/blocks', hasPermission(P.CONTENT_READ), listAdminBlocks);
router.put('/blocks/:key', hasPermission(P.CONTENT_MANAGE), blockBodyRules, saveBlock);
router.post('/blocks/:key/publish', hasPermission(P.CONTENT_PUBLISH), blockKeyRules, publishBlock);
router.post('/blocks/:key/unpublish', hasPermission(P.CONTENT_PUBLISH), blockKeyRules, unpublishBlock);

// Lists: faqs, links, milestones, committee-terms, committee-members.
router.get('/:resource', hasPermission(P.CONTENT_READ), adminListRules, listItems);
router.post('/:resource', hasPermission(P.CONTENT_MANAGE), createItemRules, createItem);
router.patch('/:resource/reorder', hasPermission(P.CONTENT_PUBLISH), reorderItemRules, reorderItems);
router.get('/:resource/:id', hasPermission(P.CONTENT_READ), itemRules, getItem);
router.patch('/:resource/:id', hasPermission(P.CONTENT_MANAGE), updateItemRules, updateItem);
router.delete('/:resource/:id', hasPermission(P.CONTENT_PUBLISH), itemRules, deleteItem);
router.post('/:resource/:id/publish', hasPermission(P.CONTENT_PUBLISH), itemRules, publishItem);
router.post('/:resource/:id/unpublish', hasPermission(P.CONTENT_PUBLISH), itemRules, unpublishItem);
router.post('/:resource/:id/archive', hasPermission(P.CONTENT_PUBLISH), itemRules, archiveItem);

export default router;
