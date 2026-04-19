import { describe, it, expect } from 'vitest';
import { createEncryptor, deriveKey } from './encryption.js';

describe('encryption', () => {
  const key = deriveKey('test-master-key-secret');

  it('round-trips a string', () => {
    const enc = createEncryptor(key);
    const ct = enc.encrypt('hello world');
    expect(ct.length).toBeGreaterThan(12 + 16);
    expect(enc.decrypt(ct)).toBe('hello world');
  });

  it('round-trips JSON', () => {
    const enc = createEncryptor(key);
    const ct = enc.encryptJson({ password: 'p', token: 't' });
    expect(enc.decryptJson(ct)).toEqual({ password: 'p', token: 't' });
  });

  it('produces distinct ciphertexts for same plaintext (random IV)', () => {
    const enc = createEncryptor(key);
    const a = enc.encrypt('same');
    const b = enc.encrypt('same');
    expect(a.equals(b)).toBe(false);
  });

  it('rejects tampered ciphertext', () => {
    const enc = createEncryptor(key);
    const ct = enc.encrypt('hello');
    ct[ct.length - 1] ^= 0xff;
    expect(() => enc.decrypt(ct)).toThrow();
  });

  it('rejects wrong key', () => {
    const enc1 = createEncryptor(deriveKey('key-one'));
    const enc2 = createEncryptor(deriveKey('key-two'));
    const ct = enc1.encrypt('hello');
    expect(() => enc2.decrypt(ct)).toThrow();
  });

  it('accepts 32-byte base64 key', () => {
    const base64Key = Buffer.alloc(32, 7).toString('base64');
    const enc = createEncryptor(deriveKey(base64Key));
    expect(enc.decrypt(enc.encrypt('x'))).toBe('x');
  });
});
