import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../i18n/translations/en';
import type { FleetReasonBadge } from './fleetVehicleDisplay';
import { OPERATIONAL_PRIMARY_REASON_LABEL_KEYS } from './operational-projection/ui/primary-reason-presentation';
import type { ActiveHealthFinding, VehicleRowOperationalProjection } from './vehicle-row-operational-projection';

const HEALTH_PRIMARY_REASON_CODES = new Set(['HEALTH_RENTAL_BLOCKED']);

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

const HEALTH_REASON_TEXT_PATTERN =
  /reifen|tire|brems|brake|batter|battery|dtc|fault|service|health|warnung|warning|kritisch|critical|überfällig|overdue|compliance|öl|oil|limp/i;

export interface RowOperationalAttentionBadge {
  text: string;
  tone: StatusTone;
}

function isConnectivityAttentionCode(code: string): boolean {
  if (OPERATIONAL_CONNECTIVITY_CODES.has(code)) return true;
  return OPERATIONAL_CONNECTIVITY_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function isOperationalAttentionReasonCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (HEALTH_PRIMARY_REASON_CODES.has(code)) return false;
  if (code.startsWith('rental_health:')) return false;
  return (
    OPERATIONAL_PRIMARY_REASON_LABEL_KEYS[code] != null || isConnectivityAttentionCode(code)
  );
}

export function shouldSuppressHealthReasonBadgeText(
  reasonBadge: FleetReasonBadge | null | undefined,
  activeHealthFindings: readonly ActiveHealthFinding[],
): boolean {
  if (!reasonBadge || activeHealthFindings.length === 0) return false;
  return HEALTH_REASON_TEXT_PATTERN.test(reasonBadge.text);
}

function attentionTone(
  projection: VehicleRowOperationalProjection,
): StatusTone {
  const attentionState = projection.attention.state;
  const connectivityState = projection.connectivity.overallState;

  if (
    attentionState === 'CRITICAL' ||
    attentionState === 'ACTION_REQUIRED' ||
    connectivityState === 'DEVICE_UNPLUGGED' ||
    connectivityState === 'INTEGRATION_ERROR'
  ) {
    return 'critical';
  }
  if (attentionState === 'WATCH' || connectivityState === 'AUTHORIZATION_REQUIRED') {
    return 'watch';
  }
  return 'neutral';
}

const CONNECTIVITY_ATTENTION_STATES = new Set([
  'DEVICE_UNPLUGGED',
  'INTEGRATION_ERROR',
  'AUTHORIZATION_REQUIRED',
  'OFFLINE',
]);

function resolveConnectivityAttentionBadge(
  projection: VehicleRowOperationalProjection,
  t: (key: TranslationKey) => string,
): RowOperationalAttentionBadge | null {
  const state = projection.connectivity.overallState;
  if (!state || !CONNECTIVITY_ATTENTION_STATES.has(state)) return null;

  const attention = projection.attention.state;
  const shouldShow =
    attention === 'CRITICAL' ||
    attention === 'ACTION_REQUIRED' ||
    attention === 'WATCH' ||
    state === 'DEVICE_UNPLUGGED' ||
    state === 'INTEGRATION_ERROR' ||
    state === 'AUTHORIZATION_REQUIRED';

  if (!shouldShow) return null;

  const key = `fleetConnectivity.state.${state}` as TranslationKey;
  return {
    text: t(key),
    tone: attentionTone(projection),
  };
}

function resolveAttentionFromProjection(
  projection: VehicleRowOperationalProjection,
  t: (key: TranslationKey) => string,
): RowOperationalAttentionBadge | null {
  const code = projection.attention.primaryReasonCode;
  if (!isOperationalAttentionReasonCode(code)) return null;

  const labelKey = projection.attention.localizationKey;
  if (!labelKey) return null;

  return {
    text: t(labelKey),
    tone: attentionTone(projection),
  };
}

/**
 * Operational attention chip for compact rows — excludes health findings
 * already rendered via VehicleHealthFindingIcons.
 */
export function resolveRowOperationalAttentionBadge(input: {
  projection: VehicleRowOperationalProjection;
  reasonBadge?: FleetReasonBadge | null;
  t: (key: TranslationKey) => string;
}): RowOperationalAttentionBadge | null {
  const projectionAttention = resolveAttentionFromProjection(input.projection, input.t);
  if (projectionAttention) return projectionAttention;

  const connectivityAttention = resolveConnectivityAttentionBadge(input.projection, input.t);
  if (connectivityAttention) return connectivityAttention;

  const { reasonBadge, projection } = input;
  if (!reasonBadge) return null;
  if (shouldSuppressHealthReasonBadgeText(reasonBadge, projection.activeHealthFindings)) {
    return null;
  }

  return {
    text: reasonBadge.text,
    tone: reasonBadge.tone,
  };
}
