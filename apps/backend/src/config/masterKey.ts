import { randomBytes } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { readOrCreateSecretFile } from './secretFile.js';

const KEY_FILE = 'master.key';
const KEY_BYTES = 32;

export function loadOrCreateMasterKey(dataDir: string, overrideEnv?: string): string {
  if (overrideEnv && overrideEnv.length > 0) {
    return overrideEnv;
  }

  const absoluteDir = isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir);
  const keyFile = join(absoluteDir, KEY_FILE);

  const contents = readOrCreateSecretFile(keyFile, () =>
    randomBytes(KEY_BYTES).toString('base64')
  ).trim();
  if (contents.length === 0) {
    throw new Error(`Master key file is empty: ${keyFile}`);
  }
  return contents;
}
