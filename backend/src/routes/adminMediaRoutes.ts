import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission from '../middlewares/hasPermission';
import uploadSingle from '../middlewares/uploadSingle';
import { Permissions } from '../config/permissions';
import { mediaFieldRules, mediaIdRules, mediaListRules, mediaUpdateRules } from '../validators/mediaValidator';
import { deleteMedia, listMedia, updateMedia, uploadMedia } from '../controllers/MediaAdminController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

router.get('/', hasPermission(P.CONTENT_READ), mediaListRules, listMedia);
// Authentication, permission and CSRF are all checked before the upload body is read.
router.post('/', hasPermission(P.MEDIA_UPLOAD), uploadSingle, mediaFieldRules, uploadMedia);
router.patch('/:id', hasPermission(P.MEDIA_UPLOAD), mediaUpdateRules, updateMedia);
router.delete('/:id', hasPermission(P.CONTENT_PUBLISH), mediaIdRules, deleteMedia);

export default router;
