import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import svgCaptcha from 'svg-captcha';
import logger from '../config/logger';
import { getJwtSecret } from './authMiddleware';
import { recordIpFailure } from './ipAccessControl';

const CAPTCHA_EXPIRY = '2m';

interface CaptchaTokenPayload {
  codeHash: string;
  purpose: 'text-captcha';
}

/** Never store the plaintext code in the JWT payload — only a salted hash of it. */
const hashCode = (code: string): string =>
  crypto.createHmac('sha256', getJwtSecret()).update(code.trim().toLowerCase()).digest('hex');

/**
 * GET /api/auth/captcha
 * Generates a distorted alphanumeric image and a short-lived signed token
 * carrying only the hash of the answer — the client never gets the plaintext.
 */
export const generateTextCaptcha = (_req: Request, res: Response): void => {
  const captcha = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    ignoreChars: '0oO1ilI', // avoid visually ambiguous characters
    width: 160,
    height: 60,
    fontSize: 50,
  });

  const captchaToken = jwt.sign(
    { codeHash: hashCode(captcha.text), purpose: 'text-captcha' } satisfies CaptchaTokenPayload,
    getJwtSecret(),
    { expiresIn: CAPTCHA_EXPIRY }
  );

  res.status(200).json({ svg: captcha.data, captchaToken });
};

/**
 * Verifies the { captchaToken, captchaAnswer } pair submitted alongside
 * register/login. Runs independently of (and in addition to) reCAPTCHA.
 */
export const verifyTextCaptcha = (req: Request, res: Response, next: NextFunction): void => {
  const { captchaToken, captchaAnswer } = req.body as { captchaToken?: string; captchaAnswer?: string };

  if (!captchaToken || !captchaAnswer) {
    res.status(400).json({ message: 'CAPTCHA answer is required' });
    return;
  }

  try {
    const decoded = jwt.verify(captchaToken, getJwtSecret()) as CaptchaTokenPayload;
    if (decoded.purpose !== 'text-captcha' || decoded.codeHash !== hashCode(captchaAnswer)) {
      recordIpFailure(req.ip || 'unknown');
      res.status(400).json({ message: 'Incorrect CAPTCHA answer' });
      return;
    }
    next();
  } catch {
    logger.warn(`Expired or invalid text CAPTCHA token from IP ${req.ip}`);
    res.status(400).json({ message: 'CAPTCHA expired — please try again' });
  }
};
