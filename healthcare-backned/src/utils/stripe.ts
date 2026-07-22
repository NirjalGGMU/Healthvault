import Stripe from 'stripe';
import logger from '../config/logger';

/** Fixed consultation deposit, in minor currency units (e.g. cents). Configurable per-deployment. */
export const DEPOSIT_AMOUNT = parseInt(process.env.STRIPE_DEPOSIT_AMOUNT_CENTS || '2000', 10);
export const DEPOSIT_CURRENCY = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();

let stripeInstance: Stripe | null = null;
let initialised = false;

/**
 * Lazily constructed so process.env is read AFTER dotenv.config() has run
 * (mirrors the pattern in middleware/captcha.ts) — module-level `new Stripe(...)`
 * at import time would otherwise capture an empty key before dotenv loads.
 */
export const getStripe = (): Stripe | null => {
  if (initialised) return stripeInstance;
  initialised = true;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    stripeInstance = null;
    logger.warn(
      'STRIPE_SECRET_KEY is not set — payment/checkout endpoints will return 503 until it is configured.'
    );
    return null;
  }

  stripeInstance = new Stripe(secretKey);
  logger.info('Stripe client initialised');
  return stripeInstance;
};
