import { Router } from 'express';
import { authRateLimiter } from '../middlewares/rateLimiter';
import requireTab from '../middlewares/requireTab';
import { submitContactRules } from '../validators/contactValidator';
import { submitContact } from '../controllers/ContactController';

const router = Router();

// Public and unauthenticated, so it gets the strict limiter used for sign-in. Refused (404) while the Contact tab is off.
router.post('/', requireTab('contact'), authRateLimiter, submitContactRules, submitContact);

export default router;
