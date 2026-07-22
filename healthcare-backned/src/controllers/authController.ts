import { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import User, { IUser, PASSWORD_HISTORY_SIZE } from '../models/User';
import logger, { maskEmail } from '../config/logger';
import { getJwtSecret, hashUserAgent } from '../middleware/authMiddleware';
import { recordIpFailure } from '../middleware/ipAccessControl';
import { checkRecaptcha } from '../middleware/captcha';
import { checkTextCaptcha } from '../middleware/textCaptcha';
import { emitSecurityEvent } from '../utils/eventBus';
import { sendMagicLinkEmail, sendPasswordResetEmail } from '../utils/mailer';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 30 * 60 * 1000; // 30 minutes
const TOKEN_EXPIRY = '1h';
const TOKEN_MAX_AGE_MS = 3600000; // 1 hour, matches TOKEN_EXPIRY
const MFA_TEMP_TOKEN_EXPIRY = '5m';
const MFA_TEMP_MAX_AGE_MS = 5 * 60 * 1000;

/** Binds the issued JWT to the requesting browser's User-Agent fingerprint */
const signToken = (user: IUser, req: Request, mfaPending = false): string => {
  return jwt.sign(
    {
      id: String(user._id),
      role: user.role,
      uaHash: hashUserAgent(req),
      ...(mfaPending ? { mfaPending: true } : {}),
    },
    getJwtSecret(),
    { expiresIn: mfaPending ? MFA_TEMP_TOKEN_EXPIRY : TOKEN_EXPIRY }
  );
};

const cookieOptions = (maxAgeMs: number): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: maxAgeMs,
});

/** Set the JWT as an httpOnly cookie — never exposed to client-side JS */
const setTokenCookie = (res: Response, token: string, maxAgeMs: number): void => {
  res.cookie('token', token, cookieOptions(maxAgeMs));
};

/**
 * POST /api/auth/register
 * Input already validated by verifyCaptcha + registerValidation middleware.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body as {
      name: string;
      email: string;
      password: string;
      role?: string;
    };

    const existing = await User.findOne({ email });
    if (existing) {
      logger.warn(`Registration attempt with duplicate email: ${maskEmail(email)}`);
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    // Password is hashed by the User pre-save hook.
    // Role is whitelisted by validation to 'doctor' | 'patient' — admin cannot be self-assigned.
    const user = await User.create({ name, email, password, role: role || 'patient' });

    logger.info(`AUTH: new user registered ${user._id} (role: ${user.role})`);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Register error: ${message}`);
    res.status(500).json({ message: 'Registration failed' });
  }
};

/**
 * POST /api/auth/login-precheck
 * Tells the frontend, before it shows the password/CAPTCHA fields, whether
 * this account will require CAPTCHA at login (see login() below — accounts
 * with MFA enabled skip it, since TOTP already gates the session). Unknown
 * emails are answered identically to non-MFA accounts (captchaRequired: true)
 * so this endpoint can't be used to test whether an email is registered.
 * Rate-limited with the same budget as /login itself to blunt use as an
 * MFA-status enumeration oracle.
 */
export const loginPrecheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('mfaEnabled');
    res.status(200).json({ captchaRequired: !user || !user.mfaEnabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Login precheck error: ${message}`);
    res.status(500).json({ message: 'Failed to check login requirements' });
  }
};

/**
 * POST /api/auth/login
 * Brute-force protected by loginLimiter (IP) and account lockout (per user).
 * CAPTCHA is enforced here, conditionally, rather than as route middleware —
 * whether it's required depends on this account's mfaEnabled flag, which
 * isn't known until after the user is looked up. Always decided from the
 * freshly-queried record, never from anything the client claims, so a
 * non-MFA account can't have CAPTCHA bypassed by tampering with the frontend.
 * On success the JWT is set as an httpOnly cookie — it is NOT returned in the body.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, captchaToken, captchaAnswer } = req.body as {
      email: string;
      password: string;
      captchaToken?: string;
      captchaAnswer?: string;
    };

    const user = await User.findOne({ email }).select('+password');

    // Unknown accounts are treated as requiring CAPTCHA too (see loginPrecheck) —
    // this decision must never itself become a way to distinguish "exists
    // without MFA" from "doesn't exist".
    const captchaRequired = !user || !user.mfaEnabled;

    if (captchaRequired) {
      const recaptchaResult = await checkRecaptcha(req);
      if (!recaptchaResult.ok) {
        res.status(400).json({ message: recaptchaResult.message });
        return;
      }

      const textCaptchaResult = checkTextCaptcha(captchaToken, captchaAnswer, req.ip);
      if (!textCaptchaResult.ok) {
        res.status(textCaptchaResult.status ?? 400).json({ message: textCaptchaResult.message });
        return;
      }
    }

    if (!user) {
      logger.warn(`AUTH: failed login (unknown email) ${maskEmail(email)} from IP ${req.ip}`);
      recordIpFailure(req.ip || 'unknown');
      emitSecurityEvent({ type: 'login_failed', message: `Failed login for unknown email`, ip: req.ip, email });
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    // Account lockout check
    if (user.isLocked && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      logger.warn(`AUTH: login attempt on locked account ${user._id} from IP ${req.ip}`);
      res.status(423).json({
        message: 'Account locked due to repeated failed logins. Try again later.',
      });
      return;
    }

    // Lock window expired — reset lock state
    if (user.isLocked && user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
      user.isLocked = false;
      user.lockUntil = null;
      user.loginAttempts = 0;
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      user.loginAttempts += 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.isLocked = true;
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        logger.warn(
          `AUTH: account ${user._id} LOCKED after ${user.loginAttempts} failed attempts (IP ${req.ip})`
        );
        emitSecurityEvent({ type: 'account_locked', message: `Account ${user.email} locked after repeated failures`, ip: req.ip, email: user.email });
      } else {
        logger.warn(
          `AUTH: failed login for ${user._id} (attempt ${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}) from IP ${req.ip}`
        );
        emitSecurityEvent({ type: 'login_failed', message: `Failed login for ${user.email}`, ip: req.ip, email: user.email });
      }

      recordIpFailure(req.ip || 'unknown');
      await user.save();
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    // Successful password check — reset counters
    user.loginAttempts = 0;
    user.isLocked = false;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    emitSecurityEvent({ type: 'login_success', message: `${user.email} logged in`, ip: req.ip, email: user.email });

    // If MFA is enabled, issue a short-lived mfaPending cookie valid only for /verify-mfa
    if (user.mfaEnabled) {
      setTokenCookie(res, signToken(user, req, true), MFA_TEMP_MAX_AGE_MS);
      logger.info(`AUTH: password verified for ${user._id}, awaiting MFA (IP ${req.ip})`);
      res.status(200).json({
        message: 'MFA required. Verify TOTP token at /api/auth/verify-mfa.',
        mfaRequired: true,
      });
      return;
    }

    const token = signToken(user, req);
    setTokenCookie(res, token, TOKEN_MAX_AGE_MS);
    logger.info(`AUTH: successful login ${user._id} from IP ${req.ip}`);

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Login error: ${message}`);
    res.status(500).json({ message: 'Login failed' });
  }
};

/**
 * POST /api/auth/enable-mfa (auth required)
 * Generates a TOTP secret. MFA becomes active after first successful /verify-mfa.
 */
export const enableMFA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const secret = speakeasy.generateSecret({
      name: `HealthVault (${user.email})`,
      length: 20,
    });

    user.mfaSecret = secret.base32;
    await user.save();

    logger.info(`AUTH: MFA secret generated for ${user._id}`);

    res.status(200).json({
      message: 'MFA secret generated. Scan the otpauth URL, then confirm at /api/auth/verify-mfa.',
      base32: secret.base32,
      otpauthUrl: secret.otpauth_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Enable MFA error: ${message}`);
    res.status(500).json({ message: 'Failed to enable MFA' });
  }
};

/**
 * POST /api/auth/verify-mfa (auth required)
 * Verifies a TOTP token. Activates MFA on first success and rotates the
 * httpOnly cookie to a full-session JWT (completing login when the request
 * arrived with an mfaPending cookie).
 */
export const verifyMFA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { token } = req.body as { token: string };

    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user || !user.mfaSecret) {
      res.status(400).json({ message: 'MFA is not set up. Call /api/auth/enable-mfa first.' });
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      logger.warn(`AUTH: failed MFA verification for ${user._id} from IP ${req.ip}`);
      recordIpFailure(req.ip || 'unknown');
      emitSecurityEvent({ type: 'mfa_failed', message: `Failed MFA attempt for ${user.email}`, ip: req.ip, email: user.email });
      res.status(401).json({ message: 'Invalid MFA token' });
      return;
    }

    if (!user.mfaEnabled) {
      user.mfaEnabled = true;
      await user.save();
      logger.info(`AUTH: MFA enabled for ${user._id}`);
    }

    const sessionToken = signToken(user, req);
    setTokenCookie(res, sessionToken, TOKEN_MAX_AGE_MS);
    logger.info(`AUTH: successful MFA verification for ${user._id} from IP ${req.ip}`);

    res.status(200).json({
      message: 'MFA verified',
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Verify MFA error: ${message}`);
    res.status(500).json({ message: 'MFA verification failed' });
  }
};

const MAGIC_LINK_EXPIRY = '10m';

interface MagicLinkPayload {
  id: string;
  purpose: 'magic-link';
}

/**
 * POST /api/auth/magic-link (public, rate limited)
 * Passwordless login: issues a short-lived one-time token instead of checking
 * a password, then emails it via nodemailer (SMTP_* env vars). If SMTP isn't
 * configured, falls back to logging the link server-side (and echoing it in
 * the response outside production) so the flow still works in dev/coursework
 * environments without real mail credentials.
 * Always returns the same generic message regardless of whether the email
 * exists, to avoid leaking which addresses are registered.
 */
export const requestMagicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const generic = { message: 'If that email is registered, a login link has been generated.' };

    if (!user) {
      logger.warn(`AUTH: magic-link requested for unknown email ${maskEmail(email)} from IP ${req.ip}`);
      res.status(200).json(generic);
      return;
    }

    const token = jwt.sign(
      { id: String(user._id), purpose: 'magic-link' } satisfies MagicLinkPayload,
      getJwtSecret(),
      { expiresIn: MAGIC_LINK_EXPIRY }
    );

    const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:5174';
    const magicLink = `${frontendOrigin}/magic-link/verify?token=${token}`;

    const emailSent = await sendMagicLinkEmail(user.email, magicLink);

    if (emailSent) {
      logger.info(`AUTH: magic-link email sent to ${user._id} from IP ${req.ip}`);
    } else {
      logger.info(
        `AUTH: SMTP not configured — magic link generated for ${user._id} from IP ${req.ip}`
      );
    }

    res.status(200).json({
      ...generic,
      // Fallback only: lets the flow work without real SMTP creds in dev/coursework environments
      ...(!emailSent && process.env.NODE_ENV !== 'production' ? { devMagicLink: magicLink } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Request magic link error: ${message}`);
    res.status(500).json({ message: 'Failed to generate login link' });
  }
};

/**
 * POST /api/auth/magic-link/verify (public)
 * Completes passwordless login. Still routes through MFA if the account has it enabled.
 */
export const verifyMagicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ message: 'Token is required' });
      return;
    }

    let decoded: MagicLinkPayload;
    try {
      decoded = jwt.verify(token, getJwtSecret()) as MagicLinkPayload;
    } catch {
      res.status(400).json({ message: 'This login link is invalid or has expired' });
      return;
    }

    if (decoded.purpose !== 'magic-link') {
      res.status(400).json({ message: 'Invalid token' });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(404).json({ message: 'Account no longer exists' });
      return;
    }

    if (user.isLocked && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      res.status(423).json({ message: 'Account locked due to repeated failed logins. Try again later.' });
      return;
    }

    if (user.mfaEnabled) {
      setTokenCookie(res, signToken(user, req, true), MFA_TEMP_MAX_AGE_MS);
      logger.info(`AUTH: magic-link verified for ${user._id}, awaiting MFA (IP ${req.ip})`);
      res.status(200).json({
        message: 'MFA required. Verify TOTP token at /api/auth/verify-mfa.',
        mfaRequired: true,
      });
      return;
    }

    user.lastLogin = new Date();
    await user.save();

    const sessionToken = signToken(user, req);
    setTokenCookie(res, sessionToken, TOKEN_MAX_AGE_MS);
    logger.info(`AUTH: successful passwordless login ${user._id} from IP ${req.ip}`);

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Verify magic link error: ${message}`);
    res.status(500).json({ message: 'Failed to verify login link' });
  }
};

const PASSWORD_RESET_EXPIRY = '1h';

interface PasswordResetPayload {
  id: string;
  purpose: 'password-reset';
  // Snapshot of the user's passwordChangedAt at issuance time. Password reset
  // tokens are stateless JWTs — there's no server-side store to mark one
  // "used" — so instead the token is only honored while it still matches the
  // account's current passwordChangedAt. A successful reset (or any other
  // password change) advances that timestamp, which invalidates this token
  // and every other outstanding reset link for the account in one step.
  pwdVersion: number;
}

/**
 * POST /api/auth/forgot-password (public, rate limited)
 * Mirrors requestMagicLink: always returns the same generic message
 * regardless of whether the email is registered, to avoid leaking which
 * addresses exist. Falls back to a dev-mode echoed link when SMTP isn't configured.
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const generic = { message: 'If that email is registered, a password reset link has been sent.' };

    if (!user) {
      logger.warn(`AUTH: password reset requested for unknown email ${maskEmail(email)} from IP ${req.ip}`);
      res.status(200).json(generic);
      return;
    }

    const token = jwt.sign(
      {
        id: String(user._id),
        purpose: 'password-reset',
        pwdVersion: user.passwordChangedAt.getTime(),
      } satisfies PasswordResetPayload,
      getJwtSecret(),
      { expiresIn: PASSWORD_RESET_EXPIRY }
    );

    const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:5174';
    const resetLink = `${frontendOrigin}/reset-password/${token}`;

    const emailSent = await sendPasswordResetEmail(user.email, resetLink);

    if (emailSent) {
      logger.info(`AUTH: password reset email sent to ${user._id} from IP ${req.ip}`);
    } else {
      logger.info(
        `AUTH: SMTP not configured — password reset link generated for ${user._id} from IP ${req.ip}`
      );
    }

    res.status(200).json({
      ...generic,
      // Fallback only: lets the flow work without real SMTP creds in dev/coursework environments
      ...(!emailSent && process.env.NODE_ENV !== 'production' ? { devResetLink: resetLink } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Forgot password error: ${message}`);
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
};

/**
 * POST /api/auth/reset-password (public)
 * Body: { token, newPassword }. Token deliberately travels in the POST body
 * rather than a URL segment on this backend route — URLs are far more likely
 * to end up in server access logs, proxy logs, or browser history than a
 * request body. The frontend route (/reset-password/:token) still captures
 * it from the emailed link and resubmits it here.
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      res.status(400).json({ message: 'Token and new password are required' });
      return;
    }

    let decoded: PasswordResetPayload;
    try {
      decoded = jwt.verify(token, getJwtSecret()) as PasswordResetPayload;
    } catch {
      res.status(400).json({ message: 'This password reset link is invalid or has expired' });
      return;
    }

    if (decoded.purpose !== 'password-reset') {
      res.status(400).json({ message: 'Invalid token' });
      return;
    }

    // Same policy as changePassword/registerValidation, enforced here too
    // since this path never goes through express-validator.
    const policyOk =
      newPassword.length >= 8 &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword);
    if (!policyOk) {
      res.status(400).json({
        message: 'New password needs 8+ characters with uppercase, lowercase, number, and special character',
      });
      return;
    }

    const user = await User.findById(decoded.id).select('+password +passwordHistory');
    if (!user) {
      res.status(404).json({ message: 'Account no longer exists' });
      return;
    }

    if (decoded.pwdVersion !== user.passwordChangedAt.getTime()) {
      res.status(400).json({ message: 'This password reset link has already been used or is out of date' });
      return;
    }

    if (await user.wasPasswordUsedBefore(newPassword)) {
      res.status(400).json({
        message: `New password cannot match your current password or any of your last ${PASSWORD_HISTORY_SIZE} passwords`,
      });
      return;
    }

    user.passwordHistory = [user.password, ...(user.passwordHistory ?? [])].slice(0, PASSWORD_HISTORY_SIZE);
    user.password = newPassword; // re-hashed by the pre-save hook; also advances passwordChangedAt
    // A successful reset is a legitimate self-service recovery path — clear
    // any stale brute-force lockout rather than making the user wait it out.
    user.loginAttempts = 0;
    user.isLocked = false;
    user.lockUntil = null;
    await user.save();

    logger.info(`AUTH: password reset completed for ${user._id} from IP ${req.ip}`);
    emitSecurityEvent({
      type: 'password_reset',
      message: `${user.email} reset their password`,
      ip: req.ip,
      email: user.email,
    });

    res.status(200).json({ message: 'Password has been reset. You can now log in with your new password.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Reset password error: ${message}`);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

/**
 * POST /api/auth/logout (auth required)
 * Clears the httpOnly session cookie and logs the event.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    if (req.user) {
      logger.info(`AUTH: user ${req.user.id} logged out from IP ${req.ip}`);
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Logout error: ${message}`);
    res.status(500).json({ message: 'Logout failed' });
  }
};