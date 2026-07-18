import {
  isLegacyDiagnosticCallsEnabled,
  isVoiceCallProviderStagingEnabled,
  isVoiceMcpGatewayFeatureEnabled,
  isVoiceNativeTwilioIntegrationEnabled,
} from '../../voice-call-orchestration/voice-feature-flags.config';
import { isVoiceWebhookIngestionEnabled } from '../../voice-webhook-ingestion/voice-webhook-ingestion.config';
import { readTwilioProvisioningFlags } from '@modules/twilio/provisioning/twilio-provisioning.config';
import {
  getVoiceE2eOrgId,
  isVoiceE2eLiveCallsEnabled,
  parseVoiceE2eAllowlistE164,
  parseForbiddenVoiceE2eOrgIds,
  voiceE2ePreflightSummary,
} from '../e2e/voice-e2e.config';
import { VOICE_STAGING_ORG_ID } from './voice-staging.constants';

export type SecretPresence = 'present' | 'absent' | 'optional';

export interface VoiceSecretReferenceStatus {
  key: string;
  presence: SecretPresence;
  scope: string;
  rotationNote: string;
}

export interface VoiceStagingPolicySnapshot {
  nativeTwilioIntegration: boolean;
  mcpGateway: boolean;
  webhookIngestion: boolean;
  provisioningStagingEnabled: boolean;
  liveCallsEnabled: boolean;
  legacyDiagnosticCalls: boolean;
  subaccountsEnabled: boolean;
  stagingOrgId: string | null;
  forbiddenOrgIds: string[];
  allowlistE164Count: number;
  twilioRegion: string | null;
  twilioEdge: string | null;
  webhookPublicBaseUrl: string | null;
}

export interface VoiceProbeResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  detail: string;
}

export function maskStagingOrgId(orgId: string): string {
  if (orgId.length <= 10) return orgId;
  return `${orgId.slice(0, 6)}…${orgId.slice(-4)}`;
}

export function evaluateVoiceSecretReferences(
  env: NodeJS.ProcessEnv = process.env,
): VoiceSecretReferenceStatus[] {
  const webhookEnabled = isVoiceWebhookIngestionEnabled(env);
  const mcpEnabled = isVoiceMcpGatewayFeatureEnabled(env);

  const row = (
    key: string,
    present: boolean,
    scope: string,
    rotationNote: string,
    optional = false,
  ): VoiceSecretReferenceStatus => ({
    key,
    presence: present ? 'present' : optional ? 'optional' : 'absent',
    scope,
    rotationNote,
  });

  return [
    row(
      'ELEVENLABS_API_KEY',
      Boolean(env.ELEVENLABS_API_KEY?.trim()),
      'ElevenLabs workspace API (Runtime Secret / backend.env)',
      'Rotate in ElevenLabs console; update VPS backend.env via sync script — never commit.',
    ),
    row(
      'ELEVENLABS_WEBHOOK_SECRET',
      Boolean(env.ELEVENLABS_WEBHOOK_SECRET?.trim()),
      'ElevenLabs post-call HMAC',
      'Rotate in ElevenLabs webhook settings; update backend.env; replay window invalidates old secret.',
      !webhookEnabled,
    ),
    row(
      'VOICE_MCP_TOKEN_SECRET',
      Boolean(env.VOICE_MCP_TOKEN_SECRET?.trim()),
      'MCP bearer JWT signing',
      'Dedicated secret on staging host; rotate independently from JWT_SECRET.',
      !mcpEnabled,
    ),
    row(
      'TWILIO_ACCOUNT_SID',
      Boolean(env.TWILIO_ACCOUNT_SID?.trim()),
      'Twilio parent control-plane (IE1)',
      'Parent account — rotate API keys in Twilio console; sync to VPS.',
    ),
    row(
      'TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET',
      Boolean(env.TWILIO_API_KEY_SID?.trim() && env.TWILIO_API_KEY_SECRET?.trim()),
      'Twilio REST SDK (IE1/Dublin)',
      'Rotate API key in Twilio; update backend.env.',
    ),
    row(
      'TWILIO_AUTH_TOKEN',
      Boolean(env.TWILIO_AUTH_TOKEN?.trim()),
      'Twilio webhook signature validation only',
      'Rotate in Twilio console; required when webhook ingestion enabled.',
      !webhookEnabled,
    ),
    row(
      'TWILIO_VOICE_WEBHOOK_BASE_URL',
      Boolean((env.TWILIO_VOICE_WEBHOOK_BASE_URL ?? env.APP_URL)?.trim()),
      'Public webhook base (APP_URL fallback)',
      'Must match deployed API host — no secret value in docs.',
    ),
    row(
      'VOICE_STAGING_SUBACCOUNT_SECRET_REF',
      Boolean(env.VOICE_STAGING_SUBACCOUNT_SECRET_REF?.trim()),
      'Post-provision Twilio subaccount (env-json:// ref)',
      'Populated after subaccount provisioning — never plaintext in DB.',
      true,
    ),
  ];
}

export function evaluateVoiceStagingPolicies(
  env: NodeJS.ProcessEnv = process.env,
): VoiceStagingPolicySnapshot {
  const twilioFlags = readTwilioProvisioningFlags(env);
  return {
    nativeTwilioIntegration: isVoiceNativeTwilioIntegrationEnabled(env),
    mcpGateway: isVoiceMcpGatewayFeatureEnabled(env),
    webhookIngestion: isVoiceWebhookIngestionEnabled(env),
    provisioningStagingEnabled: isVoiceCallProviderStagingEnabled(env),
    liveCallsEnabled: isVoiceE2eLiveCallsEnabled(env),
    legacyDiagnosticCalls: isLegacyDiagnosticCallsEnabled(env),
    subaccountsEnabled: twilioFlags.subaccountsEnabled,
    stagingOrgId: getVoiceE2eOrgId(env) ?? VOICE_STAGING_ORG_ID,
    forbiddenOrgIds: parseForbiddenVoiceE2eOrgIds(env),
    allowlistE164Count: parseVoiceE2eAllowlistE164(env).length,
    twilioRegion: env.TWILIO_REGION?.trim() ?? null,
    twilioEdge: env.TWILIO_EDGE?.trim() ?? null,
    webhookPublicBaseUrl: (env.TWILIO_VOICE_WEBHOOK_BASE_URL ?? env.APP_URL)?.trim() ?? null,
  };
}

export function deriveProvisioningGoNoGo(input: {
  secrets: VoiceSecretReferenceStatus[];
  policies: VoiceStagingPolicySnapshot;
  probes: VoiceProbeResult[];
  stagingOrgExists: boolean;
}): { decision: 'GO' | 'NO-GO'; blockers: string[] } {
  const blockers: string[] = [];

  const requiredSecrets = input.secrets.filter(s => s.presence === 'absent');
  for (const secret of requiredSecrets) {
    if (
      [
        'ELEVENLABS_API_KEY',
        'ELEVENLABS_WEBHOOK_SECRET',
        'VOICE_MCP_TOKEN_SECRET',
        'TWILIO_ACCOUNT_SID',
        'TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET',
        'TWILIO_AUTH_TOKEN',
      ].includes(secret.key)
    ) {
      blockers.push(`Secret missing: ${secret.key}`);
    }
  }

  if (!input.stagingOrgExists) {
    blockers.push('Staging organization not bootstrapped in database');
  }

  if (!input.policies.provisioningStagingEnabled) {
    blockers.push('VOICE_AI_PROVISIONING_STAGING_ENABLED is not true on host');
  }

  if (input.policies.liveCallsEnabled) {
    blockers.push('VOICE_E2E_ALLOW_LIVE_CALLS must remain false until post-provision canary');
  }

  if (input.policies.legacyDiagnosticCalls) {
    blockers.push('VOICE_LEGACY_DIAGNOSTIC_CALLS must remain false');
  }

  const failedProbes = input.probes.filter(p => p.status === 'fail');
  for (const probe of failedProbes) {
    blockers.push(`Probe failed: ${probe.id} — ${probe.detail}`);
  }

  return { decision: blockers.length === 0 ? 'GO' : 'NO-GO', blockers };
}

export function voiceE2eSafetySummary(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  return voiceE2ePreflightSummary(env);
}
