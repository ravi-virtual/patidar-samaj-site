import { Router } from 'express';
import hasToken from '../middlewares/hasToken';
import isAuthenticated from '../middlewares/isAuthenticated';
import isStaff from '../middlewares/isStaff';
import hasPermission from '../middlewares/hasPermission';
import { Permissions } from '../config/permissions';
import { auditListRules, updateSettingsRules } from '../validators/settingsValidator';
import { getDashboard, listAudit } from '../controllers/DashboardController';
import { getAdminSettings, updateSettings } from '../controllers/SettingsController';

const router = Router();
const P = Permissions;

router.use(hasToken, isAuthenticated, isStaff);

router.get('/dashboard', hasPermission(P.DASHBOARD_VIEW), getDashboard);
router.get('/audit', hasPermission(P.AUDIT_READ), auditListRules, listAudit);
router.get('/settings', hasPermission(P.SETTINGS_MANAGE), getAdminSettings);
router.patch('/settings', hasPermission(P.SETTINGS_MANAGE), updateSettingsRules, updateSettings);

export default router;
