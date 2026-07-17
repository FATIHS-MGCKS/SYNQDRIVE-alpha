/**
 * Voice staging E2E safety gates (Prompt 10B).
 * Live PSTN calls require explicit opt-in + E.164 allowlist + staging org.
 */
import {
  assertLiveProviderCallsAllowed,
  isVoiceCallProviderStagingEnabled,
} from '../../voice-call-orchestration/voice-feature-flags.config';

const PRODUCTION_ORG_NAME_PATTERNS = [/production/i, /^prod[-_]/i, /kunden/i];

export function isVoiceE2eLiveCallsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_E2E_ALLOW_LIVE_CALLS?.trim().toLowerCase() === 'true';
}

export function parseVoiceE2eAllowlistE164(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.VOICE_E2E_ALLOWLIST_E164?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => normalizeE164(entry))
    .filter(Boolean);
}

export function getVoiceE2eOrgId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = env.VOICE_E2E_ORG_ID?.trim();
  return id || null;
}

export function parseForbiddenVoiceE2eOrgIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.VOICE_E2E_FORBIDDEN_ORG_IDS?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function assertVoiceE2eStagingOrg(orgId: string, env: NodeJS.ProcessEnv = process.env): void {
  const forbidden = parseForbiddenVoiceE2eOrgIds(env);
  if (forbidden.includes(orgId)) {
    throw new Error(`Organization ${orgId} is explicitly forbidden for voice E2E.`);
  }
  for (const pattern of PRODUCTION_ORG_NAME_PATTERNS) {
    if (pattern.test(orgId)) {
      throw new Error(`Organization ${orgId} matches a production guard pattern — voice E2E blocked.`);
    }
  }
}

export function assertVoiceE2eLiveCallAllowed(
  targetE164: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isVoiceE2eLiveCallsEnabled(env)) {
    throw new Error('Live voice E2E calls require VOICE_E2E_ALLOW_LIVE_CALLS=true.');
  }
  assertLiveProviderCallsAllowed(env);
  const allowlist = parseVoiceE2eAllowlistE164(env);
  if (allowlist.length === 0) {
    throw new Error('VOICE_E2E_ALLOWLIST_E164 must list at least one explicit E.164 target.');
  }
  const normalized = normalizeE164(targetE164);
  if (!allowlist.includes(normalized)) {
    throw new Error(`Target ${maskE164(targetE164)} is not on VOICE_E2E_ALLOWLIST_E164.`);
  }
  const orgId = getVoiceE2eOrgId(env);
  if (!orgId) {
    throw new Error('VOICE_E2E_ORG_ID is required for live voice E2E.');
  }
  assertVoiceE2eStagingOrg(orgId, env);
}

export function voiceE2ePreflightSummary(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  return {
    liveCallsEnabled: isVoiceE2eLiveCallsEnabled(env),
    stagingProvisioning: isVoiceCallProviderStagingEnabled(env),
    allowlistCount: parseVoiceE2eAllowlistE164(env).length,
    stagingOrgConfigured: Boolean(getVoiceE2eOrgId(env)),
    forbiddenOrgCount: parseForbiddenVoiceE2eOrgIds(env).length,
  };
}

export function normalizeE164(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function maskE164(value: string): string {
  const normalized = normalizeE164(value);
  if (normalized.length < 6) return '***';
  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
}
