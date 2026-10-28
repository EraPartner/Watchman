import { createHash } from 'node:crypto';

/** 43 base64 characters: an unpadded SHA-256 digest, as `ssh-keygen -l` prints it. */
const FINGERPRINT_BODY = /^[A-Za-z0-9+/]{43}$/;

/**
 * Normalize a pinned host-key fingerprint to the bare base64 digest. Accepts
 * what `ssh-keygen -lf` prints ("SHA256:abc…"), with or without the prefix
 * and trailing "=" padding. Returns null when it is not a SHA-256 fingerprint.
 */
export function normalizeHostKeyFingerprint(value: string): string | null {
  const body = value.trim().replace(/^SHA256:/i, '').replace(/=+$/, '');
  return FINGERPRINT_BODY.test(body) ? body : null;
}

/** OpenSSH-style fingerprint ("SHA256:<base64>") of a raw host key blob. */
export function hostKeyFingerprint(key: Buffer): string {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

/**
 * Compare the host key a server presented with the pinned fingerprint.
 * Returns null on a match, otherwise the fingerprint the server presented.
 */
export function hostKeyMismatch(key: Buffer, pinned: string): string | null {
  const actual = hostKeyFingerprint(key);
  return actual.slice('SHA256:'.length) === normalizeHostKeyFingerprint(pinned)
    ? null
    : actual;
}
