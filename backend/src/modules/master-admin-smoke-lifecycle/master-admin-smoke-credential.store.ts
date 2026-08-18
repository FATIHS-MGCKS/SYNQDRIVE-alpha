import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PROCESS_OWNER_ID = typeof process.getuid === 'function' ? process.getuid() : process.pid;
const DEFAULT_BASENAME = `.synqdrive-master-admin-smoke-${PROCESS_OWNER_ID}.cred`;

export function resolveSmokeCredentialFilePath(): string {
  return (
    process.env.MASTER_ADMIN_SMOKE_CREDENTIAL_FILE?.trim() ||
    path.join(os.tmpdir(), DEFAULT_BASENAME)
  );
}

export function resolveSmokeStateFilePath(): string {
  return (
    process.env.MASTER_ADMIN_SMOKE_STATE_FILE?.trim() ||
    path.join(os.tmpdir(), `.synqdrive-master-admin-smoke-${PROCESS_OWNER_ID}.state.json`)
  );
}

export function generateSmokePassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function writeSmokeCredential(password: string): string {
  const filePath = resolveSmokeCredentialFilePath();
  fs.writeFileSync(filePath, password, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best effort on platforms without chmod support
  }
  return filePath;
}

export function readSmokeCredential(): string | null {
  const filePath = resolveSmokeCredentialFilePath();
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

export function destroySmokeCredential(): boolean {
  const filePath = resolveSmokeCredentialFilePath();
  if (!fs.existsSync(filePath)) return false;
  try {
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}
