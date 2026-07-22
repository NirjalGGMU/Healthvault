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
 * Ethereal (dev/test SMTP) captures mail instead of delivering it and hands
 * back a web preview URL for each send. nodemailer.getTestMessageUrl returns
 * null/false for any non-Ethereal transport, so this is a no-op with a real
 * provider (Gmail, etc.) — safe to call unconditionally.
 */
const logPreviewUrlIfAvailable = (info: nodemailer.SentMessageInfo): void => {
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    logger.info(`MAIL: Ethereal preview — ${previewUrl}`);
  }
};

/**
 * Sends the passwordless login link by email. Returns true if an email was
 * actually dispatched; false when SMTP isn't configured (dev/coursework
 * environments), so callers can fall back to logging the link instead.
 */
export const sendMagicLinkEmail = async (to: string, magicLink: string): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) return false;

  const info = await mailer.sendMail({
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
  logPreviewUrlIfAvailable(info);
  return true;
};

/**
 * Sends the password reset link by email. Same true/false-return contract as
 * sendMagicLinkEmail so callers can fall back to logging/dev-echoing the link
 * when SMTP isn't configured.
 */
export const sendPasswordResetEmail = async (to: string, resetLink: string): Promise<boolean> => {
  const mailer = getTransporter();
  if (!mailer) return false;

  const info = await mailer.sendMail({
    from: process.env.SMTP_FROM || '"HealthVault" <no-reply@healthvault.local>',
    to,
    subject: 'Reset your HealthVault password',
    text: `Click the link below to reset your HealthVault password. This link expires in 1 hour and can only be used once.\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email — your password will not be changed.`,
    html: `
      <p>Click the button below to reset your HealthVault password. This link expires in <strong>1 hour</strong> and can only be used once.</p>
      <p><a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
      <p>Or paste this link into your browser:<br>${resetLink}</p>
      <p>If you did not request this, you can safely ignore this email — your password will not be changed.</p>
    `,
  });

  logger.info(`MAIL: password reset email dispatched to ${to}`);
  logPreviewUrlIfAvailable(info);
  return true;
};
