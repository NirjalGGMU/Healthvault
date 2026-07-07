import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getAllUsers,
  getDoctors,
  uploadAvatar,
  importUsers,
  changePassword,
} from '../controllers/userController';
import { protect } from '../middleware/authMiddleware';
import { authorizeRoles } from '../middleware/roleMiddleware';
import { uploads } from '../middleware/upload';

const router = Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/profile/photo', protect, uploads.single('avatar'), uploadAvatar);
router.put('/change-password', protect, changePassword);
router.get('/doctors', protect, getDoctors);
router.get('/all', protect, authorizeRoles('admin'), getAllUsers);
router.post('/import', protect, authorizeRoles('admin'), importUsers);

export default router;
