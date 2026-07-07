import { NextFunction, Request, Response } from 'express';
import logger from '../config/logger';
import { emitSecurityEvent } from '../utils/eventBus';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ipAllowlisted?: boolean;
    }
  }
}

const FAILURE_WINDOW_MS = 15 * 60 * 1000; // matches the login rate-limit window
const FAILURE_THRESHOLD = 10; // failed logins/captchas across the whole app, not per-account
const BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

const ALLOWLIST = new Set(
  (process.env.IP_ALLOWLIST || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
);

interface FailureRecord {
  count: number;
  windowStart: number;
}

const failures = new Map<string, FailureRecord>();
const blockedUntil = new Map<string, number>();

const ipKey = (req: Request): string => req.ip || 'unknown';

/** Called from login/CAPTCHA failure paths to track abuse per-IP, independent of per-account lockout */
export const recordIpFailure = (ip: string): void => {
  const now = Date.now();
  const record = failures.get(ip);

  if (!record || now - record.windowStart > FAILURE_WINDOW_MS) {
    failures.set(ip, { count: 1, windowStart: now });
    return;
  }

  record.count += 1;
  if (record.count >= FAILURE_THRESHOLD) {
    blockedUntil.set(ip, now + BLOCK_DURATION_MS);
    failures.delete(ip);
    logger.warn(`SECURITY: IP ${ip} auto-blocked for ${BLOCK_DURATION_MS / 60000} minutes after ${FAILURE_THRESHOLD} failures`);
    emitSecurityEvent({ type: 'ip_blocked', message: `IP ${ip} blocked after repeated failed attempts`, ip });
  }
};

/**
 * Runs before rate limiting. Allow-listed IPs (IP_ALLOWLIST env var) skip all
 * throttling; IPs that crossed the failure threshold are hard-blocked until
 * their block window expires.
 */
export const ipAccessControl = (req: Request, res: Response, next: NextFunction): void => {
  const ip = ipKey(req);

  if (ALLOWLIST.has(ip)) {
    req.ipAllowlisted = true;
    next();
    return;
  }

  const blockedAt = blockedUntil.get(ip);
  if (blockedAt) {
    if (blockedAt > Date.now()) {
      res.status(403).json({
        message: 'Your IP has been temporarily blocked due to repeated suspicious activity',
      });
      return;
    }
    blockedUntil.delete(ip); // block window expired
  }

  next();
};
