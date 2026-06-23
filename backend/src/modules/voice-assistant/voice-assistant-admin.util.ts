import { VoiceAssistant, VoiceConnectionStatus } from '@prisma/client';
import type { ReadinessResult } from './voice-assistant.service';
import type { TelephonyStatusSnapshot } from './voice-assistant-telephony.util';

export function readinessPercent(readiness: ReadinessResult): number {
  if (!readiness.checks.length) return 0;
  const required = readiness.checks.filter((c) => c.required !== false);
  const pool = required.length > 0 ? required : readiness.checks;
  const ok = pool.filter((c) => c.ok).length;
  return Math.round((ok / pool.length) * 100);
}

export function resolveProviderWarning(
  providerConfigured: boolean,
  assistant: VoiceAssistant | null,
  telephony: TelephonyStatusSnapshot | null,
): string | null {
  if (!providerConfigured) {
    return 'ElevenLabs is not configured on the server.';
  }
  if (!assistant) return null;
  if (assistant.connectionStatus === VoiceConnectionStatus.ERROR) {
    return 'Provider connection error.';
  }
  if (assistant.connectionStatus === VoiceConnectionStatus.DEGRADED) {
    return 'Provider connection degraded.';
  }
  if (telephony?.status === 'provider_not_connected') {
    return telephony.detail;
  }
  return null;
}

export function buildAdminWarnings(
  assistant: VoiceAssistant,
  readiness: ReadinessResult,
  telephony: TelephonyStatusSnapshot,
  providerConfigured: boolean,
): string[] {
  const warnings: string[] = [];
  if (!providerConfigured) {
    warnings.push('ElevenLabs API is not configured on the server.');
  }
  if (!readiness.ready) {
    warnings.push(`Readiness incomplete: ${readiness.missing.join(', ')}`);
  }
  if (assistant.status === 'ACTIVE' && !readiness.ready) {
    warnings.push('Assistant is active but not fully ready.');
  }
  if (telephony.status !== 'ready_for_inbound' && (assistant.telephonyEnabled || assistant.inboundEnabled)) {
    warnings.push(telephony.detail);
  }
  if (assistant.connectionStatus === VoiceConnectionStatus.ERROR) {
    warnings.push('Connection status is ERROR.');
  }
  return [...new Set(warnings)];
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
