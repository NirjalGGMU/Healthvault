import { NextFunction, Request, Response } from 'express';
import { RecaptchaV2 } from 'express-recaptcha';
import logger from '../config/logger';

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

export interface CaptchaCheckResult {
  ok: boolean;
  message?: string;
}

/**
 * Verifies the `g-recaptcha-response` field against Google directly (no res/next
 * needed), so callers that must decide conditionally — e.g. login() deciding
 * per-account whether CAPTCHA applies — can await this inline instead of
 * being forced through unconditional route middleware.
 */
export const checkRecaptcha = (req: Request): Promise<CaptchaCheckResult> => {
  const recaptcha = getRecaptcha();

  if (!recaptcha) {
    // Not configured (development) — warn once at init, do not block
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    recaptcha.verify(req, (error) => {
      if (error) {
        logger.warn(`CAPTCHA verification failed from IP ${req.ip}: ${error}`);
        resolve({ ok: false, message: 'CAPTCHA verification failed. Please try again.' });
        return;
      }
      resolve({ ok: true });
    });
  });
};

/**
 * Google reCAPTCHA v2 verification middleware.
 * Expects the client to send `g-recaptcha-response` in the request body
 * (the standard field produced by the reCAPTCHA widget).
 */
export const verifyCaptcha = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const result = await checkRecaptcha(req);
  if (!result.ok) {
    res.status(400).json({ message: result.message });
    return;
  }
  next();
};