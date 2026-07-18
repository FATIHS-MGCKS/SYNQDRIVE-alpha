import * as fs from 'fs';

const SUBACCOUNT_ENV_PREFIX = 'VOICE_TWILIO_SUB_';

export function buildSubaccountEnvKey(organizationId: string): string {
  return `${SUBACCOUNT_ENV_PREFIX}${organizationId.replace(/-/g, '_').toUpperCase()}`;
}

/**
 * Persists subaccount runtime credentials into a host env file (e.g. VPS backend.env).
 * Never logs credential values.
 */
export function persistSubaccountCredentialsToEnvFile(
  envFilePath: string,
  organizationId: string,
  credentials: Record<string, string>,
): string {
  const envKey = buildSubaccountEnvKey(organizationId);
  const serialized = JSON.stringify(credentials);
  const line = `${envKey}=${serialized}`;

  let existing = '';
  if (fs.existsSync(envFilePath)) {
    existing = fs.readFileSync(envFilePath, 'utf8');
  }

  const pattern = new RegExp(`^${envKey}=.*$`, 'm');
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.replace(/\s*$/, '')}\n${line}\n`;

  fs.writeFileSync(envFilePath, next, 'utf8');
  return `env-json://${envKey}`;
}
