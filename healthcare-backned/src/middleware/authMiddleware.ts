import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User, { PASSWORD_EXPIRY_DAYS } from '../models/User';
import logger from '../config/logger';

export interface AuthTokenPayload extends JwtPayload {
  id: string;
  role: string;
  mfaPending?: boolean;
  uaHash?: string;
}

/**
 * Session binding: a short hash of the browser's User-Agent, captured at
 * login and re-checked on every request. If the JWT is stolen and replayed
 * from a different device/browser, the fingerprint won't match.
 */
export const hashUserAgent = (req: Request): string =>
  crypto.createHash('sha256').update(req.headers['user-agent'] || 'unknown').digest('hex');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        mfaPending?: boolean;
      };
    }
  }
}

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return secret;
};

/**
 * Extract the JWT: primary source is the httpOnly 'token' cookie
 * (set by login / verify-mfa). Falls back to the Authorization
 * Bearer header for non-browser API clients (Postman, scripts).
 */
const extractToken = (req: Request): string | undefined => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  if (cookies?.token) {
    return cookies.token;
  }
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.split(' ')[1];
  }
  return undefined;
};

/**
 * Verifies the JWT (httpOnly cookie first), confirms the user still exists,
 * and attaches { id, role } to req.user.
 */
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ message: 'Not authorized: no token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;

    // Zero-trust: never rely on the token alone — re-fetch live state every request.
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ message: 'Not authorized: user no longer exists' });
      return;
    }

    // Re-check lock status live, in case the account was locked after this token was issued
    if (user.isLocked && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      res.status(423).json({ message: 'Account is locked' });
      return;
    }

    // Session binding: reject a stolen/replayed cookie presented from a different device
    if (decoded.uaHash && decoded.uaHash !== hashUserAgent(req)) {
      logger.warn(`AUTH: session device-fingerprint mismatch for user ${decoded.id} from IP ${req.ip}`);
      res.status(401).json({ message: 'Session bound to a different device — please log in again' });
      return;
    }

    // A cookie issued mid-MFA-login may only be used to complete MFA verification
    if (decoded.mfaPending === true && !req.originalUrl.endsWith('/verify-mfa')) {
      res.status(401).json({ message: 'MFA verification required to complete login' });
      return;
    }

    // Password expiry: block everything except the routes needed to fix it
    const isExemptRoute =
      req.originalUrl.endsWith('/change-password') ||
      req.originalUrl.endsWith('/logout') ||
      req.originalUrl.endsWith('/verify-mfa'); // must be reachable to complete login before we can enforce this
    const passwordAgeMs = Date.now() - new Date(user.passwordChangedAt ?? 0).getTime();
    if (!isExemptRoute && passwordAgeMs > PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
      res.status(403).json({
        message: `Your password is more than ${PASSWORD_EXPIRY_DAYS} days old and must be changed`,
        code: 'PASSWORD_EXPIRED',
      });
      return;
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      mfaPending: decoded.mfaPending === true,
    };
    next();
  } catch (error) {
    logger.warn(`Invalid or expired JWT presented from IP ${req.ip}`);
    res.status(401).json({ message: 'Not authorized: invalid or expired token' });
  }
};