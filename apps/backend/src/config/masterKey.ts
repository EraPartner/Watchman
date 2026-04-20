import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const KEY_FILE = 'master.key';
const KEY_BYTES = 32;
const KEY_MODE = 0o600;

export function loadOrCreateMasterKey(dataDir: string, overrideEnv?: string): string {
  if (overrideEnv && overrideEnv.length > 0) {
    return overrideEnv;
  }

  const absoluteDir = isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir);
  const keyFile = join(absoluteDir, KEY_FILE);

  if (existsSync(keyFile)) {
    const contents = readFileSync(keyFile, 'utf8').trim();
    if (contents.length === 0) {
      throw new Error(`Master key file is empty: ${keyFile}`);
    }
    try {
      chmodSync(keyFile, KEY_MODE);
    } catch {
      // ignore chmod failure on platforms without POSIX perms
    }
    return contents;
  }

  mkdirSync(absoluteDir, { recursive: true });
  const key = randomBytes(KEY_BYTES).toString('base64');
  writeFileSync(keyFile, key, { mode: KEY_MODE });
  try {
    chmodSync(keyFile, KEY_MODE);
  } catch {
    // ignore chmod failure on platforms without POSIX perms
  }
  return key;
}
