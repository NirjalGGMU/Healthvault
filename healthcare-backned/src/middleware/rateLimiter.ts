import rateLimit from 'express-rate-limit';
import logger from '../config/logger';

/**
 * Global limiter: 100 requests per 15 minutes per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ipAllowlisted === true,
  message: { message: 'Too many requests, please try again later' },
  handler: (req, res, _next, options) => {
    logger.warn(`Global rate limit exceeded by IP ${req.ip} on ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Login limiter (brute force protection): 5 requests per 15 minutes per IP.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ipAllowlisted === true,
  skipSuccessfulRequests: true,
  message: { message: 'Too many login attempts, please try again after 15 minutes' },
  handler: (req, res, _next, options) => {
    logger.warn(`Login rate limit exceeded by IP ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * OTP/MFA limiter: 5 requests per 5 minutes per IP. A 6-digit TOTP has only
 * 1,000,000 possible values — without a dedicated throttle this endpoint
 * would otherwise fall back to the much looser 100/15min global limiter,
 * leaving far more brute-force attempts available than the account-lockout
 * threshold intends. Keyed to the same 5-minute window as the mfaPending
 * cookie itself, so a blocked attacker can't outlast their own temp token.
 */
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ipAllowlisted === true,
  skipSuccessfulRequests: true,
  message: { message: 'Too many verification attempts, please try again in a few minutes' },
  handler: (req, res, _next, options) => {
    logger.warn(`OTP/MFA rate limit exceeded by IP ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Registration limiter: 10 requests per 15 minutes per IP. Prevents
 * automated mass account creation / email-enumeration-via-register abuse,
 * independent of the CAPTCHA checks that run on the same route.
 */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ipAllowlisted === true,
  message: { message: 'Too many registration attempts, please try again later' },
  handler: (req, res, _next, options) => {
    logger.warn(`Registration rate limit exceeded by IP ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});
