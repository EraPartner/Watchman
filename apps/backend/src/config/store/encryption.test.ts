import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEncryptor,
  deriveKey,
  loadEncryptorFromEnv,
} from "./encryption.js";

describe("encryption", () => {
  const key = deriveKey("test-master-key-secret");

  it("round-trips a string", () => {
    const enc = createEncryptor(key);
    const ct = enc.encrypt("hello world");
    expect(ct.length).toBeGreaterThan(12 + 16);
    expect(enc.decrypt(ct)).toBe("hello world");
  });

  it("round-trips JSON", () => {
    const enc = createEncryptor(key);
    const ct = enc.encryptJson({ password: "p", token: "t" });
    expect(enc.decryptJson(ct)).toEqual({ password: "p", token: "t" });
  });

  it("produces distinct ciphertexts for same plaintext (random IV)", () => {
    const enc = createEncryptor(key);
    const a = enc.encrypt("same");
    const b = enc.encrypt("same");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const enc = createEncryptor(key);
    const ct = enc.encrypt("hello");
    ct[ct.length - 1] ^= 0xff;
    expect(() => enc.decrypt(ct)).toThrow();
  });

  it("rejects wrong key", () => {
    const enc1 = createEncryptor(deriveKey("key-one"));
    const enc2 = createEncryptor(deriveKey("key-two"));
    const ct = enc1.encrypt("hello");
    expect(() => enc2.decrypt(ct)).toThrow();
  });

  it("accepts 32-byte base64 key", () => {
    const base64Key = Buffer.alloc(32, 7).toString("base64");
    const enc = createEncryptor(deriveKey(base64Key));
    expect(enc.decrypt(enc.encrypt("x"))).toBe("x");
  });

  it("decrypts with a legacy fallback key, encrypts with the new key", () => {
    const primary = deriveKey("primary-secret");
    const legacy = deriveKey("legacy-secret");
    const legacyCt = createEncryptor(legacy).encrypt("old-secret");

    const enc = createEncryptor(primary, { legacyDecryptKey: legacy });
    // legacy record still opens
    expect(enc.decrypt(legacyCt)).toBe("old-secret");
    // new writes use the primary key (not decryptable by legacy alone)
    const newCt = enc.encrypt("new-secret");
    expect(() => createEncryptor(legacy).decrypt(newCt)).toThrow();
    expect(createEncryptor(primary).decrypt(newCt)).toBe("new-secret");
  });
});

describe("loadEncryptorFromEnv (passphrase KDF + migration)", () => {
  const freshDir = () => mkdtempSync(join(tmpdir(), "wm-enc-"));

  it("requires a key", () => {
    expect(() => loadEncryptorFromEnv(undefined, freshDir())).toThrow();
    expect(() => loadEncryptorFromEnv("", freshDir())).toThrow();
  });

  it("upgrades a passphrase to salted scrypt (not bare sha256)", () => {
    const dir = freshDir();
    const enc = loadEncryptorFromEnv("correct horse battery staple", dir);
    const ct = enc.encrypt("token");
    // the old bare-sha256 key must NOT be able to open a freshly-written record
    const legacyKey = createHash("sha256")
      .update("correct horse battery staple", "utf8")
      .digest();
    expect(() => createEncryptor(legacyKey).decrypt(ct)).toThrow();
  });

  it("still decrypts legacy sha256-encrypted records (lazy migration)", () => {
    const dir = freshDir();
    const passphrase = "an operator passphrase";
    const legacyKey = createHash("sha256").update(passphrase, "utf8").digest();
    const legacyCt = createEncryptor(legacyKey).encrypt("legacy-token");

    const enc = loadEncryptorFromEnv(passphrase, dir);
    expect(enc.decrypt(legacyCt)).toBe("legacy-token");
  });

  it("persists the salt so records survive a restart", () => {
    const dir = freshDir();
    const ct = loadEncryptorFromEnv("passphrase", dir).encrypt("v");
    // second load in the same data dir must derive the same scrypt key
    expect(loadEncryptorFromEnv("passphrase", dir).decrypt(ct)).toBe("v");
  });

  it("uses a 32-byte base64 key directly (no scrypt, no salt file)", () => {
    const key = randomBytes(32).toString("base64");
    const dir = freshDir();
    const enc = loadEncryptorFromEnv(key, dir);
    expect(enc.decrypt(enc.encrypt("x"))).toBe("x");
    // same key derived directly opens it — no per-deployment salt involved
    expect(createEncryptor(deriveKey(key)).decrypt(enc.encrypt("y"))).toBe("y");
  });
});
