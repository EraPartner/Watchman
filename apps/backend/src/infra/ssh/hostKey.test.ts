import { describe, expect, it } from 'vitest';
import { hostKeyFingerprint, hostKeyMismatch, normalizeHostKeyFingerprint } from './hostKey.js';

// An ed25519 public key blob (the base64 part of a .pub line) and the
// fingerprint `ssh-keygen -lf` prints for it.
const BLOB = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl', 'base64');
const FINGERPRINT = 'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU';

describe('hostKeyFingerprint', () => {
  it('matches the OpenSSH SHA256 fingerprint format', () => {
    expect(hostKeyFingerprint(BLOB)).toBe(FINGERPRINT);
  });
});

describe('normalizeHostKeyFingerprint', () => {
  it('accepts the fingerprint with or without prefix and padding', () => {
    const body = FINGERPRINT.slice('SHA256:'.length);
    expect(normalizeHostKeyFingerprint(FINGERPRINT)).toBe(body);
    expect(normalizeHostKeyFingerprint(body)).toBe(body);
    expect(normalizeHostKeyFingerprint(` sha256:${body}= `)).toBe(body);
  });

  it('rejects anything that is not a SHA-256 fingerprint', () => {
    expect(normalizeHostKeyFingerprint('')).toBeNull();
    expect(normalizeHostKeyFingerprint('MD5:16:27:ac:a5:76:28:2d:36:63:1b:56:4d:eb:df:a6:48')).toBeNull();
  });
});

describe('hostKeyMismatch', () => {
  it('returns null for the pinned key', () => {
    expect(hostKeyMismatch(BLOB, FINGERPRINT)).toBeNull();
  });

  it('returns the presented fingerprint for any other key', () => {
    const other = Buffer.from('another host key');
    expect(hostKeyMismatch(other, FINGERPRINT)).toBe(hostKeyFingerprint(other));
  });

  it('never matches a malformed pin', () => {
    expect(hostKeyMismatch(BLOB, 'not-a-fingerprint')).toBe(FINGERPRINT);
  });
});
