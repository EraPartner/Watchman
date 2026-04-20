import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface ClientConfig {
  apiUrl?: string;
}

const FILE_NAME = 'client-config.json';

function configPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function load(): ClientConfig {
  const file = configPath();
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'apiUrl' in parsed) {
      const url = (parsed as { apiUrl?: unknown }).apiUrl;
      if (typeof url === 'string') {
        return { apiUrl: url };
      }
    }
    return {};
  } catch {
    return {};
  }
}

export function save(next: ClientConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
}
