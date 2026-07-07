import { NextFunction, Request, Response } from 'express';
import { RecaptchaV2 } from 'express-recaptcha';
import logger from '../config/logger';

interface RecaptchaResult {
  error: string | null;
}

type RecaptchaRequest = Request & { recaptcha?: RecaptchaResult };

// Lazily initialised so process.env is read AFTER dotenv.config() has run
// (ES module imports are hoisted above the dotenv call in server.ts).
let recaptchaInstance: RecaptchaV2 | null = null;
let initialised = false;

const getRecaptcha = (): RecaptchaV2 | null => {
  if (initialised) return recaptchaInstance;
  initialised = true;

  const siteKey = process.env.RECAPTCHA_SITE_KEY;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (siteKey && secretKey) {
    recaptchaInstance = new RecaptchaV2(siteKey, secretKey);
    logger.info('reCAPTCHA v2 verification is ACTIVE on register/login');
  } else {
    recaptchaInstance = null;
    logger.warn(
      'reCAPTCHA keys missing (RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY) — CAPTCHA verification is SKIPPED. Set both keys in .env before production.'
    );
  }
  return recaptchaInstance;
};

/**
 * Google reCAPTCHA v2 verification middleware.
 * Expects the client to send `g-recaptcha-response` in the request body
 * (the standard field produced by the reCAPTCHA widget).
 */
export const verifyCaptcha = (req: Request, res: Response, next: NextFunction): void => {
  const recaptcha = getRecaptcha();

  if (!recaptcha) {
    // Not configured (development) — warn once at init, do not block
    next();
    return;
  }

  recaptcha.middleware.verify(req, res, () => {
    const result = (req as RecaptchaRequest).recaptcha;
    if (result?.error) {
      logger.warn(`CAPTCHA verification failed from IP ${req.ip}: ${result.error}`);
      res.status(400).json({ message: 'CAPTCHA verification failed. Please try again.' });
      return;
    }
    next();
  });
};