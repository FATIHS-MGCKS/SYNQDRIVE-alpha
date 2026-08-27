import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../i18n/translations/en';
import type { FleetReasonBadge } from './fleetVehicleDisplay';
import {
  isOperationalAttentionReasonBadge,
  isOperationalAttentionReasonCode,
  shouldSuppressHealthReasonBadge,
} from './fleet-reason-badge-domain';
import type { VehicleRowOperationalProjection } from './vehicle-row-operational-projection';

export type { FleetReasonBadgeDomain } from './fleet-reason-badge-domain';
export {
  classifyReasonBadgeDomain,
  isOperationalAttentionReasonCode,
  shouldSuppressHealthReasonBadge,
} from './fleet-reason-badge-domain';

export interface RowOperationalAttentionBadge {
  text: string;
  tone: StatusTone;
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
 *
 * Domain classification is machine-readable (FleetReasonBadge.domain / projection codes).
 * Rendered localized text is never used as authority.
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

  if (shouldSuppressHealthReasonBadge(reasonBadge, projection.activeHealthFindings)) {
    return null;
  }

  if (!isOperationalAttentionReasonBadge(reasonBadge)) {
    return null;
  }

  return {
    text: reasonBadge.text,
    tone: reasonBadge.tone,
  };
}
