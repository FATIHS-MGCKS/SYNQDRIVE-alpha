import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve backend env file (production symlink or local dev `.env`).
 * `SYNQDRIVE_BACKEND_ENV` overrides the default `backend/.env` path.
 */
export function resolveBackendEnvFilePath(cwd: string = process.cwd()): string {
  return (
    process.env.SYNQDRIVE_BACKEND_ENV?.trim() ||
    path.resolve(cwd, '.env')
  );
}

/**
 * Load KEY=VALUE lines into `process.env` without overriding variables already set
 * in the process environment (shell / systemd / Cursor secrets keep precedence).
 */
export function loadBackendEnvIntoProcessEnv(options?: {
  cwd?: string;
  envFilePath?: string;
}): { envFilePath: string; loaded: boolean } {
  const envFilePath = options?.envFilePath ?? resolveBackendEnvFilePath(options?.cwd ?? process.cwd());
  if (!fs.existsSync(envFilePath)) {
    return { envFilePath, loaded: false };
  }

  for (const line of fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] != null && process.env[key] !== '') continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  return { envFilePath, loaded: true };
}
