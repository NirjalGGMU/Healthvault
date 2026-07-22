import { Router } from 'express';
import {
  register,
  login,
  loginPrecheck,
  enableMFA,
  verifyMFA,
  logout,
  requestMagicLink,
  verifyMagicLink,
  forgotPassword,
  resetPassword,
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import { verifyCaptcha } from '../middleware/captcha';
import { generateTextCaptcha, verifyTextCaptcha } from '../middleware/textCaptcha';
import { loginLimiter, otpLimiter, registerLimiter } from '../middleware/rateLimiter';
import {
  registerValidation,
  loginValidation,
  mfaValidation,
  handleValidationErrors,
} from '../middleware/validateInput';

const router = Router();

router.get('/captcha', generateTextCaptcha);
router.post(
  '/register',
  registerLimiter,
  verifyCaptcha,
  verifyTextCaptcha,
  registerValidation,
  handleValidationErrors,
  register
);
// CAPTCHA is not enforced here as middleware — login() decides per-account
// (based on mfaEnabled) after looking the user up, since that isn't known yet
// at this point. See loginPrecheck below and the comment on login() itself.
router.post(
  '/login',
  loginLimiter,
  loginValidation,
  handleValidationErrors,
  login
);
// Lets the frontend know, before showing password/CAPTCHA fields, whether
// this account will require CAPTCHA. Shares /login's rate-limit budget so it
// can't be used for fast MFA-status enumeration.
router.post('/login-precheck', loginLimiter, loginPrecheck);
router.post('/magic-link', loginLimiter, requestMagicLink);
router.post('/magic-link/verify', verifyMagicLink);
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/enable-mfa', protect, enableMFA);
router.post('/verify-mfa', protect, otpLimiter, mfaValidation, handleValidationErrors, verifyMFA);
router.post('/logout', protect, logout);

export default router;