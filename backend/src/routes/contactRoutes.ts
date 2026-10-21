import { Router } from 'express';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { submitContactRules } from '../validators/contactValidator';
import { submitContact } from '../controllers/ContactController';

const router = Router();

// Public and unauthenticated, so it gets the strict limiter used for sign-in.
router.post('/', authRateLimiter, submitContactRules, submitContact);

export default router;
