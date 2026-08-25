import type { StatusTone } from '../../../components/patterns';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  normalizeOperationalAvailabilityState,
  OPERATIONAL_AVAILABILITY_STATE,
  type FleetOperationalAvailability,
  type OperationalAvailabilityState,
} from './types';

const STATE_LABEL_KEYS: Record<OperationalAvailabilityState, TranslationKey> = {
  [OPERATIONAL_AVAILABILITY_STATE.AVAILABLE]: 'fleet.operationalAvailability.available',
  [OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION]:
    'fleet.operationalAvailability.needsVerification',
  [OPERATIONAL_AVAILABILITY_STATE.UNKNOWN]: 'fleet.operationalAvailability.unknown',
  [OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE]: 'fleet.operationalAvailability.unavailable',
};

const STATE_TOOLTIP_KEYS: Partial<Record<OperationalAvailabilityState, TranslationKey>> = {
  [OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION]:
    'fleet.operationalAvailability.tooltip.needsVerification',
  [OPERATIONAL_AVAILABILITY_STATE.UNKNOWN]: 'fleet.operationalAvailability.tooltip.unknown',
  [OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE]:
    'fleet.operationalAvailability.tooltip.unavailable',
};

const REASON_LABEL_KEYS: Record<string, TranslationKey> = {
  DEVICE_CHECK_REQUIRED: 'fleet.operationalAvailability.reason.deviceCheckRequired',
  TELEMETRY_OFFLINE: 'fleet.operationalAvailability.reason.telemetryOffline',
  BUSINESS_WORKFLOW_BLOCKED: 'fleet.operationalAvailability.reason.businessWorkflowBlocked',
  HEALTH_RENTAL_BLOCKED: 'fleet.operationalAvailability.reason.healthRentalBlocked',
};

const STATE_TONES: Record<OperationalAvailabilityState, StatusTone> = {
  [OPERATIONAL_AVAILABILITY_STATE.AVAILABLE]: 'success',
  [OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION]: 'watch',
  [OPERATIONAL_AVAILABILITY_STATE.UNKNOWN]: 'neutral',
  [OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE]: 'critical',
};

export interface OperationalAvailabilityPresentation {
  state: OperationalAvailabilityState;
  labelKey: TranslationKey;
  label: string;
  tone: StatusTone;
  tooltip: string | null;
  reasonLabel: string | null;
}

export function mapOperationalAvailabilityPresentation(
  availability: FleetOperationalAvailability | null | undefined,
  options: { t: (key: TranslationKey) => string },
): OperationalAvailabilityPresentation {
  const state = normalizeOperationalAvailabilityState(availability?.state);
  const labelKey = STATE_LABEL_KEYS[state];
  const tooltipKey = STATE_TOOLTIP_KEYS[state];
  const primaryReason = availability?.primaryReason ?? null;
  const reasonKey = primaryReason ? REASON_LABEL_KEYS[primaryReason] : undefined;

  return {
    state,
    labelKey,
    label: options.t(labelKey),
    tone: STATE_TONES[state],
    tooltip: tooltipKey ? options.t(tooltipKey) : null,
    reasonLabel: reasonKey ? options.t(reasonKey) : null,
  };
}
