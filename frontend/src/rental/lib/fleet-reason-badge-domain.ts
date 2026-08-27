import { OPERATIONAL_PRIMARY_REASON_LABEL_KEYS } from './operational-projection/ui/primary-reason-presentation';

export type FleetReasonBadgeDomain = 'health' | 'operational' | 'workflow' | 'unknown';

const HEALTH_REASON_CODES = new Set(['HEALTH_RENTAL_BLOCKED', 'HEALTH_GENERIC']);

const WORKFLOW_REASON_CODES = new Set(['RETURN_OVERDUE', 'PICKUP_OVERDUE']);

const OPERATIONAL_CONNECTIVITY_PREFIXES = [
  'TELEMETRY_',
  'DEVICE_',
  'DATA_COVERAGE_',
  'AUTHORIZATION_',
  'CONSENT_',
  'TOKEN_',
  'PROVIDER_',
  'LINK_',
  'WEBHOOK_',
  'STATE_',
  'MANUAL_',
] as const;

const OPERATIONAL_CONNECTIVITY_CODES = new Set([
  'NO_ACTIVE_PROVIDER_LINK',
  'NO_TELEMETRY_TIMESTAMP',
  'INTEGRATION_ERROR',
  'NEEDS_VERIFICATION',
]);

function isConnectivityReasonCode(code: string): boolean {
  if (OPERATIONAL_CONNECTIVITY_CODES.has(code)) return true;
  return OPERATIONAL_CONNECTIVITY_PREFIXES.some((prefix) => code.startsWith(prefix));
}

/**
 * Machine-readable domain for a reason badge — never derived from rendered text.
 */
export function classifyReasonBadgeDomain(code: string | null | undefined): FleetReasonBadgeDomain {
  if (!code) return 'unknown';
  if (HEALTH_REASON_CODES.has(code) || code.startsWith('rental_health:')) return 'health';
  if (WORKFLOW_REASON_CODES.has(code)) return 'workflow';
  if (code === 'HEALTH_RENTAL_BLOCKED') return 'health';
  if (code !== 'HEALTH_RENTAL_BLOCKED' && OPERATIONAL_PRIMARY_REASON_LABEL_KEYS[code] != null) {
    return 'operational';
  }
  if (isConnectivityReasonCode(code)) return 'operational';
  return 'unknown';
}

export function isOperationalAttentionReasonCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (code === 'HEALTH_RENTAL_BLOCKED') return false;
  if (code.startsWith('rental_health:')) return false;
  return (
    OPERATIONAL_PRIMARY_REASON_LABEL_KEYS[code] != null || isConnectivityReasonCode(code)
  );
}

/**
 * Suppress legacy health reason text when canonical finding icons are authoritative.
 */
export function shouldSuppressHealthReasonBadge(
  reasonBadge: { domain: FleetReasonBadgeDomain; code?: string | null } | null | undefined,
  activeHealthFindings: readonly unknown[],
): boolean {
  if (!reasonBadge || activeHealthFindings.length === 0) return false;
  if (reasonBadge.domain !== 'health') return false;
  return true;
}

/**
 * Whether a legacy reason badge may appear on the operational-attention chip.
 */
export function isOperationalAttentionReasonBadge(
  reasonBadge: { domain: FleetReasonBadgeDomain; code?: string | null } | null | undefined,
): boolean {
  if (!reasonBadge) return false;
  if (reasonBadge.domain === 'operational' || reasonBadge.domain === 'workflow') return true;
  if (reasonBadge.domain === 'health' && reasonBadge.code === 'HEALTH_RENTAL_BLOCKED') return true;
  return false;
}
