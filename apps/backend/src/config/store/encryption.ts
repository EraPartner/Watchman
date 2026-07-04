import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

// Salted-scrypt parameters for the passphrase path (see loadEncryptorFromEnv).
// N=2^14 is an interactive-login cost that sits comfortably within node's default
// scrypt maxmem while making offline brute force far costlier than a bare sha256.
const SALT_FILE = "master.key.salt";
const SALT_LEN = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

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
  return createHash("sha256").update(trimmed, "utf8").digest();
}

function tryBase64(value: string, len: number): Buffer | null {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(normalized, "base64");
    return buf.length === len ? buf : null;
  } catch {
    return null;
  }
}

function tryHex(value: string, len: number): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length !== len * 2) return null;
  try {
    return Buffer.from(value, "hex");
  } catch {
    return null;
  }
}

export function createEncryptor(
  key: Buffer,
  opts: { legacyDecryptKey?: Buffer } = {}
): Encryptor {
  if (key.length !== KEY_LEN) {
    throw new Error(
      `Encryption key must be ${KEY_LEN} bytes, got ${key.length}`
    );
  }
  const legacyKey = opts.legacyDecryptKey;

  function encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  function decryptWith(
    k: Buffer,
    iv: Buffer,
    tag: Buffer,
    body: Buffer
  ): string {
    const decipher = createDecipheriv(ALGO, k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      "utf8"
    );
  }

  function decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < IV_LEN + TAG_LEN) {
      throw new Error("Ciphertext too short");
    }
    const iv = ciphertext.subarray(0, IV_LEN);
    const tag = ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const body = ciphertext.subarray(IV_LEN + TAG_LEN);
    try {
      return decryptWith(key, iv, tag, body);
    } catch (err) {
      // Legacy fallback: records written before the scrypt upgrade used the old
      // unsalted sha256(passphrase) key. AES-GCM authentication means a wrong key
      // throws, so this branch can only succeed on genuinely legacy ciphertext;
      // rewrites use the new key, so records migrate lazily.
      if (legacyKey) {
        return decryptWith(legacyKey, iv, tag, body);
      }
      throw err;
    }
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

export function loadEncryptorFromEnv(
  envKey: string | undefined,
  dataDir: string
): Encryptor {
  if (!envKey || envKey.length === 0) {
    throw new Error(
      "WATCHMAN_MASTER_KEY is required for encrypted config storage"
    );
  }
  const trimmed = envKey.trim();
  // A 32-byte base64/hex key is already high-entropy — use it directly.
  const b64 = tryBase64(trimmed, KEY_LEN);
  if (b64) return createEncryptor(b64);
  const hex = tryHex(trimmed, KEY_LEN);
  if (hex) return createEncryptor(hex);
  // Otherwise it's a passphrase. A bare sha256(passphrase) is cheaply brute-
  // forced offline if the encrypted store leaks, so stretch it with salted
  // scrypt (persisted per-deployment salt). Keep the old sha256 key as a
  // decrypt-only fallback so pre-upgrade records still open and migrate lazily.
  const salt = loadOrCreateSalt(dataDir);
  const primary = scryptSync(trimmed, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const legacy = createHash("sha256").update(trimmed, "utf8").digest();
  return createEncryptor(primary, { legacyDecryptKey: legacy });
}

// The scrypt salt is not secret, but it must be STABLE across restarts or
// newly-written records become undecryptable next boot. Persist it next to the
// master key (0600), created once on first use.
function loadOrCreateSalt(dataDir: string): Buffer {
  const absoluteDir = isAbsolute(dataDir)
    ? dataDir
    : resolve(process.cwd(), dataDir);
  const saltFile = join(absoluteDir, SALT_FILE);
  if (existsSync(saltFile)) {
    const raw = readFileSync(saltFile, "utf8").trim();
    if (raw.length > 0) return Buffer.from(raw, "base64");
  }
  mkdirSync(absoluteDir, { recursive: true });
  const salt = randomBytes(SALT_LEN);
  writeFileSync(saltFile, salt.toString("base64"), { mode: 0o600 });
  try {
    chmodSync(saltFile, 0o600);
  } catch {
    // ignore chmod failure on platforms without POSIX perms
  }
  return salt;
}
