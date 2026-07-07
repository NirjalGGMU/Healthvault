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
