import { Router } from 'express';
import {
  bookAppointment,
  getMyAppointments,
  cancelAppointment,
  getAllAppointments,
} from '../controllers/appointmentController';
import { protect } from '../middleware/authMiddleware';
import { authorizeRoles } from '../middleware/roleMiddleware';
import { appointmentValidation, handleValidationErrors } from '../middleware/validateInput';

const router = Router();

router.post(
  '/book',
  protect,
  authorizeRoles('patient'),
  appointmentValidation,
  handleValidationErrors,
  bookAppointment
);
router.get('/my', protect, getMyAppointments);
router.put('/:id/cancel', protect, cancelAppointment);
router.get('/all', protect, authorizeRoles('admin', 'doctor'), getAllAppointments);

export default router;
