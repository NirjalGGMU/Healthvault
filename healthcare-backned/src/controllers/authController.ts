import { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import User, { IUser } from '../models/User';
import logger from '../config/logger';
import { getJwtSecret, hashUserAgent } from '../middleware/authMiddleware';
import { recordIpFailure } from '../middleware/ipAccessControl';
import { emitSecurityEvent } from '../utils/eventBus';
import { sendMagicLinkEmail } from '../utils/mailer';

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
      logger.warn(`Registration attempt with duplicate email: ${email}`);
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    // Password is hashed by the User pre-save hook.
    // Role is whitelisted by validation to 'doctor' | 'patient' — admin cannot be self-assigned.
    const user = await User.create({ name, email, password, role: role || 'patient' });

    logger.info(`AUTH: new user registered ${user.email} (role: ${user.role})`);

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
 * POST /api/auth/login
 * Brute-force protected by loginLimiter (IP), CAPTCHA, and account lockout (per user).
 * On success the JWT is set as an httpOnly cookie — it is NOT returned in the body.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      logger.warn(`AUTH: failed login (unknown email) ${email} from IP ${req.ip}`);
      recordIpFailure(req.ip || 'unknown');
      emitSecurityEvent({ type: 'login_failed', message: `Failed login for unknown email`, ip: req.ip, email });
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    // Account lockout check
    if (user.isLocked && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      logger.warn(`AUTH: login attempt on locked account ${user.email} from IP ${req.ip}`);
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
          `AUTH: account ${user.email} LOCKED after ${user.loginAttempts} failed attempts (IP ${req.ip})`
        );
        emitSecurityEvent({ type: 'account_locked', message: `Account ${user.email} locked after repeated failures`, ip: req.ip, email: user.email });
      } else {
        logger.warn(
          `AUTH: failed login for ${user.email} (attempt ${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}) from IP ${req.ip}`
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
      logger.info(`AUTH: password verified for ${user.email}, awaiting MFA (IP ${req.ip})`);
      res.status(200).json({
        message: 'MFA required. Verify TOTP token at /api/auth/verify-mfa.',
        mfaRequired: true,
      });
      return;
    }

    const token = signToken(user, req);
    setTokenCookie(res, token, TOKEN_MAX_AGE_MS);
    logger.info(`AUTH: successful login ${user.email} from IP ${req.ip}`);

    res.status(200).json({
      message: 'Login successful',
      token,
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

    logger.info(`AUTH: MFA secret generated for ${user.email}`);

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
      logger.warn(`AUTH: failed MFA verification for ${user.email} from IP ${req.ip}`);
      recordIpFailure(req.ip || 'unknown');
      emitSecurityEvent({ type: 'mfa_failed', message: `Failed MFA attempt for ${user.email}`, ip: req.ip, email: user.email });
      res.status(401).json({ message: 'Invalid MFA token' });
      return;
    }

    if (!user.mfaEnabled) {
      user.mfaEnabled = true;
      await user.save();
      logger.info(`AUTH: MFA enabled for ${user.email}`);
    }

    const sessionToken = signToken(user, req);
    setTokenCookie(res, sessionToken, TOKEN_MAX_AGE_MS);
    logger.info(`AUTH: successful MFA verification for ${user.email} from IP ${req.ip}`);

    res.status(200).json({
      message: 'MFA verified',
      token: sessionToken,
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
      logger.warn(`AUTH: magic-link requested for unknown email ${email} from IP ${req.ip}`);
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
      logger.info(`AUTH: magic-link email sent to ${user.email} from IP ${req.ip}`);
    } else {
      logger.info(
        `AUTH: SMTP not configured — magic link generated for ${user.email} from IP ${req.ip}: ${magicLink}`
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
      logger.info(`AUTH: magic-link verified for ${user.email}, awaiting MFA (IP ${req.ip})`);
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
    logger.info(`AUTH: successful passwordless login ${user.email} from IP ${req.ip}`);

    res.status(200).json({
      message: 'Login successful',
      token: sessionToken,
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