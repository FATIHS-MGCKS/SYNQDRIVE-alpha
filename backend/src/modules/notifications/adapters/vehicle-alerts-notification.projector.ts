import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type {
  DashboardWarningLight,
  DashboardWarningLightsResponse,
} from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import type { VehicleAlertsNotificationAdapterSource } from './notification-adapter.types';

export const VEHICLE_ALERTS_NOTIFICATION_EVENT_TYPES = [
  'LIMP_MODE_ACTIVE',
  'ENGINE_OIL_LEVEL_LOW',
  'ENGINE_OIL_LEVEL_HIGH',
] as const;

export type VehicleAlertsNotificationEventType =
  (typeof VEHICLE_ALERTS_NOTIFICATION_EVENT_TYPES)[number];

export type VehicleAlertNotificationCondition = 'ACTIVE' | 'CLEARED' | 'UNEVALUABLE';

export interface VehicleAlertNotificationProjection {
  eventType: VehicleAlertsNotificationEventType;
  condition: VehicleAlertNotificationCondition;
  telltaleKey: 'engine_limp_mode' | 'engine_oil_level';
  blocksRental: boolean;
  severity: 'warning' | 'critical';
  reason?: string;
}

function findLight(
  envelope: DashboardWarningLightsResponse,
  key: 'engine_limp_mode' | 'engine_oil_level',
): DashboardWarningLight | undefined {
  return envelope.lights.find((light) => light.key === key);
}

/** Envelope-level unevaluable — does not imply recovery for any cause. */
export function isVehicleAlertsNotificationEnvelopeUnevaluable(
  envelope: DashboardWarningLightsResponse | null,
  opts?: { loadFailed?: boolean },
): boolean {
  if (opts?.loadFailed) return true;
  if (!envelope) return true;
  if (envelope.connectionStatus === 'provider_error' || envelope.freshness === 'error') {
    return true;
  }
  if (
    envelope.connectionStatus === 'not_connected' &&
    envelope.supportStatus === 'not_connected'
  ) {
    return true;
  }
  return false;
}

export function projectLimpModeNotificationCondition(
  light: DashboardWarningLight | undefined,
  envelopeUnevaluable: boolean,
): VehicleAlertNotificationCondition {
  if (envelopeUnevaluable) return 'UNEVALUABLE';
  if (!light || light.state === 'unsupported') return 'UNEVALUABLE';
  if (light.isCurrentActive === true) return 'ACTIVE';
  if (light.state === 'off_confirmed') return 'CLEARED';
  return 'UNEVALUABLE';
}

export function projectOilLowNotificationCondition(
  light: DashboardWarningLight | undefined,
  envelopeUnevaluable: boolean,
): VehicleAlertNotificationCondition {
  if (envelopeUnevaluable) return 'UNEVALUABLE';
  if (!light || light.state === 'unsupported') return 'UNEVALUABLE';
  if (light.isCurrentActive === true && light.rentalImpact === 'block_rental') return 'ACTIVE';
  if (light.state === 'off_confirmed') return 'CLEARED';
  if (light.isCurrentActive === true && light.rentalImpact === 'inspect_before_next_rental') {
    return 'CLEARED';
  }
  return 'UNEVALUABLE';
}

export function projectOilHighNotificationCondition(
  light: DashboardWarningLight | undefined,
  envelopeUnevaluable: boolean,
): VehicleAlertNotificationCondition {
  if (envelopeUnevaluable) return 'UNEVALUABLE';
  if (!light || light.state === 'unsupported') return 'UNEVALUABLE';
  if (light.isCurrentActive === true && light.rentalImpact === 'inspect_before_next_rental') {
    return 'ACTIVE';
  }
  if (light.state === 'off_confirmed') return 'CLEARED';
  if (light.isCurrentActive === true && light.rentalImpact === 'block_rental') {
    return 'CLEARED';
  }
  return 'UNEVALUABLE';
}

export function projectVehicleAlertNotificationStates(
  envelope: DashboardWarningLightsResponse | null,
  opts?: { loadFailed?: boolean },
): VehicleAlertNotificationProjection[] {
  const envelopeUnevaluable = isVehicleAlertsNotificationEnvelopeUnevaluable(envelope, opts);
  const limp = envelope ? findLight(envelope, 'engine_limp_mode') : undefined;
  const oil = envelope ? findLight(envelope, 'engine_oil_level') : undefined;

  return [
    {
      eventType: 'LIMP_MODE_ACTIVE',
      condition: projectLimpModeNotificationCondition(limp, envelopeUnevaluable),
      telltaleKey: 'engine_limp_mode',
      blocksRental: true,
      severity: 'critical',
      reason: limp?.reason,
    },
    {
      eventType: 'ENGINE_OIL_LEVEL_LOW',
      condition: projectOilLowNotificationCondition(oil, envelopeUnevaluable),
      telltaleKey: 'engine_oil_level',
      blocksRental: true,
      severity: 'critical',
      reason: oil?.reason,
    },
    {
      eventType: 'ENGINE_OIL_LEVEL_HIGH',
      condition: projectOilHighNotificationCondition(oil, envelopeUnevaluable),
      telltaleKey: 'engine_oil_level',
      blocksRental: false,
      severity: 'warning',
      reason: oil?.reason,
    },
  ];
}

/**
 * Maps canonical Dashboard Warning Lights read model to V2 notification adapter sources.
 * Emits only ACTIVE (open/reopen) and CLEARED (resolve) — UNEVALUABLE emits nothing.
 */
export function projectVehicleAlertNotifications(
  vehicleId: string,
  label: string,
  envelope: DashboardWarningLightsResponse | null,
  opts?: { loadFailed?: boolean },
): VehicleAlertsNotificationAdapterSource[] {
  const states = projectVehicleAlertNotificationStates(envelope, opts);
  const sources: VehicleAlertsNotificationAdapterSource[] = [];

  for (const state of states) {
    if (state.condition === 'UNEVALUABLE') continue;
    sources.push({
      eventType: state.eventType,
      vehicleId,
      label,
      reason: state.reason,
      blocksRental: state.blocksRental,
      severity: state.severity,
      telltaleKey: state.telltaleKey,
      canonicalState: state.condition,
      cleared: state.condition === 'CLEARED',
    });
  }

  return sources;
}

export function vehicleAlertsSourceFingerprint(
  organizationId: string,
  source: Pick<VehicleAlertsNotificationAdapterSource, 'eventType' | 'vehicleId'>,
): string {
  const def = requireEventTypeDefinition(source.eventType);
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    def.conditionCode,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
