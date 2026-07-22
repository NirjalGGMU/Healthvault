import crypto from 'crypto';
import logger from '../config/logger';

//  Shared AES-256-GCM helpers
// Extracted from appointmentController.ts so the vault document feature can
// reuse the exact same algorithm/key derivation instead of inventing new crypto.

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_SALT = 'healthvault-notes-salt';

if (!process.env.ENCRYPTION_KEY) {
  logger.warn(
    'ENCRYPTION_KEY is not set; deriving the notes/document encryption key from JWT_SECRET (legacy behaviour). Set ENCRYPTION_KEY to stop rotating JWT_SECRET from also invalidating stored ciphertext.'
  );
}

/** Primary key: derived from ENCRYPTION_KEY when set, otherwise identical to the legacy key. */
const getPrimaryKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Neither ENCRYPTION_KEY nor JWT_SECRET is defined; cannot derive encryption key');
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
};

/** Legacy key: always derived from JWT_SECRET (the pre-split behaviour), used to read data encrypted before ENCRYPTION_KEY existed. */
const getLegacyKey = (): Buffer => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined; cannot derive encryption key');
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
};

/** Encrypts UTF-8 text (e.g. appointment notes) into a "iv:tag:ciphertext" hex string */
export const encryptNotes = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getPrimaryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decryptNotesWithKey = (key: Buffer, ivHex: string, tagHex: string, dataHex: string): string => {
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

/** Decrypts a value produced by encryptNotes. Returns '' if tampered or wrong key. */
export const decryptNotes = (payload: string): string => {
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, dataHex] = parts;
    try {
      return decryptNotesWithKey(getPrimaryKey(), ivHex, tagHex, dataHex);
    } catch {
      // Falls through to the legacy key below — covers notes encrypted before ENCRYPTION_KEY existed.
      return decryptNotesWithKey(getLegacyKey(), ivHex, tagHex, dataHex);
    }
  } catch {
    logger.error('Failed to decrypt appointment notes (tampered or wrong key)');
    return '';
  }
};

/**
 * Encrypts an arbitrary binary buffer (e.g. an uploaded vault document).
 * The IV (12 bytes) and auth tag (16 bytes) are prefixed onto the ciphertext
 * so the whole thing is a single self-contained buffer safe to write to disk.
 */
export const encryptBuffer = (plainBuffer: Buffer): Buffer => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getPrimaryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
};

/** Decrypts a buffer produced by encryptBuffer. Throws if tampered or wrong key. */
export const decryptBuffer = (payload: Buffer): Buffer => {
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getPrimaryKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    // Falls through to the legacy key below — covers documents encrypted before ENCRYPTION_KEY existed.
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getLegacyKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
};
