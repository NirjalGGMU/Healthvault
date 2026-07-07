import { Router } from 'express';
import { streamSecurityEvents } from '../controllers/adminController';
import { protect } from '../middleware/authMiddleware';
import { authorizeRoles } from '../middleware/roleMiddleware';

const router = Router();

router.get('/events', protect, authorizeRoles('admin'), streamSecurityEvents);

export default router;
