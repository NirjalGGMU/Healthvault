import { Router } from 'express';
import {
  register,
  login,
  enableMFA,
  verifyMFA,
  logout,
  requestMagicLink,
  verifyMagicLink,
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import { verifyCaptcha } from '../middleware/captcha';
import { generateTextCaptcha, verifyTextCaptcha } from '../middleware/textCaptcha';
import { loginLimiter } from '../middleware/rateLimiter';
import {
  registerValidation,
  loginValidation,
  mfaValidation,
  handleValidationErrors,
} from '../middleware/validateInput';

const router = Router();

router.get('/captcha', generateTextCaptcha);
router.post('/register', verifyCaptcha, verifyTextCaptcha, registerValidation, handleValidationErrors, register);
router.post(
  '/login',
  loginLimiter,
  verifyCaptcha,
  verifyTextCaptcha,
  loginValidation,
  handleValidationErrors,
  login
);
router.post('/magic-link', loginLimiter, requestMagicLink);
router.post('/magic-link/verify', verifyMagicLink);
router.post('/enable-mfa', protect, enableMFA);
router.post('/verify-mfa', protect, mfaValidation, handleValidationErrors, verifyMFA);
router.post('/logout', protect, logout);

export default router;