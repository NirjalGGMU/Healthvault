import nodemailer, { Transporter } from 'nodemailer';
import logger from '../config/logger';

let transporter: Transporter | null = null;

/** Lazily built so a missing SMTP config doesn't crash the app at import time. */
const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
};

/**
 * Sends the passwordless login link by email. Returns true if an email was
 * actually dispatched; false when SMTP isn't configured (dev/coursework
 * environments), so callers can fall back to logging the link instead.
 */
export const sendMagicLinkEmail = async (to: string, magicLink: string): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) return false;

  await mailer.sendMail({
    from: process.env.SMTP_FROM || '"HealthVault" <no-reply@healthvault.local>',
    to,
    subject: 'Your HealthVault login link',
    text: `Click the link below to log in to HealthVault. This link expires in 10 minutes and can only be used once.\n\n${magicLink}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `
      <p>Click the button below to log in to HealthVault. This link expires in <strong>10 minutes</strong> and can only be used once.</p>
      <p><a href="${magicLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Log in to HealthVault</a></p>
      <p>Or paste this link into your browser:<br>${magicLink}</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });

  logger.info(`MAIL: magic-link email dispatched to ${to}`);
  return true;
};
