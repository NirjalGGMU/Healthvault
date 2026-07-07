/**
 * Client-side encryption for appointment notes using AES-GCM (Web Crypto API).
 *
 * NOTE ON SCOPE: real end-to-end encryption needs the backend to generate and
 * distribute a distinct key per patient/care-team, since only they should be
 * able to decrypt. This repo has no backend to do that key exchange, so the
 * symmetric key here is derived from a fixed app-level passphrase. That means
 * ciphertext is opaque to anyone reading the raw API payload/DB record, but
 * not to someone reading this frontend bundle — it demonstrates the
 * encrypt/decrypt flow rather than providing real confidentiality.
 */

const PREFIX = 'enc:v1:';
const APP_PASSPHRASE = 'healthvault-notes-v1';
const SALT = new TextEncoder().encode('healthvault-static-salt');

let cachedKey: CryptoKey | null = null;

const getKey = async (): Promise<CryptoKey> => {
  if (cachedKey) return cachedKey;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedKey;
};

const toBase64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
};

const fromBase64 = (str: string): Uint8Array => {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Encrypts plaintext notes into a self-describing "enc:v1:<iv>:<ciphertext>" string */
export const encryptNotes = async (plainText: string): Promise<string> => {
  if (!plainText) return plainText;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText)
  );
  return `${PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
};

/**
 * Decrypts a value produced by encryptNotes. Values that don't carry the
 * "enc:v1:" prefix are assumed to be legacy/plaintext and returned unchanged,
 * so existing un-encrypted notes keep displaying normally.
 */
export const decryptNotes = async (value: string | null | undefined): Promise<string> => {
  if (!value || !value.startsWith(PREFIX)) return value ?? '';
  const [, , ivB64, dataB64] = value.split(':');
  try {
    const key = await getKey();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) as BufferSource },
      key,
      fromBase64(dataB64) as BufferSource
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return '[unable to decrypt note]';
  }
};
