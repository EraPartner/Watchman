import { readFileSync } from 'node:fs';
import { loadServicesConfig, type ServicesConfig } from './services.js';

const ENV_VAR = 'WATCHMAN_SERVICES_CONFIG';

function parseJson(raw: string, origin: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${origin}: ${msg}`);
  }
}

export function loadServicesConfigFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServicesConfig {
  const value = source[ENV_VAR];
  if (!value || value.trim() === '') {
    return loadServicesConfig({ instances: [] });
  }

  const trimmed = value.trim();
  const raw =
    trimmed.startsWith('{') || trimmed.startsWith('[')
      ? parseJson(trimmed, `${ENV_VAR} inline JSON`)
      : parseJson(readFileSync(trimmed, 'utf8'), `${ENV_VAR} file ${trimmed}`);

  return loadServicesConfig(raw);
}
