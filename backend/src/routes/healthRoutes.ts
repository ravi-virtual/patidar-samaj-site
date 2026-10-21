import { Router } from 'express';
import { getHealth } from '../controllers/HealthController';

const router = Router();

router.get('/', getHealth);

export default router;
