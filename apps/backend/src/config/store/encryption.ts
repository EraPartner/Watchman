import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export interface Encryptor {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
  encryptJson(value: unknown): Buffer;
  decryptJson<T = unknown>(ciphertext: Buffer): T;
}

export function deriveKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const b64 = tryBase64(trimmed, KEY_LEN);
  if (b64) return b64;
  const hex = tryHex(trimmed, KEY_LEN);
  if (hex) return hex;
  return createHash('sha256').update(trimmed, 'utf8').digest();
}

function tryBase64(value: string, len: number): Buffer | null {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(normalized, 'base64');
    return buf.length === len ? buf : null;
  } catch {
    return null;
  }
}

function tryHex(value: string, len: number): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length !== len * 2) return null;
  try {
    return Buffer.from(value, 'hex');
  } catch {
    return null;
  }
}

export function createEncryptor(key: Buffer): Encryptor {
  if (key.length !== KEY_LEN) {
    throw new Error(`Encryption key must be ${KEY_LEN} bytes, got ${key.length}`);
  }

  function encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  function decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < IV_LEN + TAG_LEN) {
      throw new Error('Ciphertext too short');
    }
    const iv = ciphertext.subarray(0, IV_LEN);
    const tag = ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const body = ciphertext.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  return {
    encrypt,
    decrypt,
    encryptJson(value: unknown): Buffer {
      return encrypt(JSON.stringify(value));
    },
    decryptJson<T = unknown>(ciphertext: Buffer): T {
      return JSON.parse(decrypt(ciphertext)) as T;
    },
  };
}

export function loadEncryptorFromEnv(envKey: string | undefined): Encryptor {
  if (!envKey || envKey.length === 0) {
    throw new Error('WATCHMAN_MASTER_KEY is required for encrypted config storage');
  }
  return createEncryptor(deriveKey(envKey));
}
