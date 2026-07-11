import { NotificationEntityType } from './notification.enums';
import type { NotificationFingerprintParts } from './notification.types';
import { buildNotificationFingerprint } from './notification-fingerprint.factory';

export interface NotificationFingerprintRegistryEntry {
  eventType: string;
  conditionCode: string;
  domain: string;
  eventKind: 'EVENT' | 'STATE';
  defaultEntityType: NotificationEntityType;
  scopeVersion: number;
  description: string;
}

/**
 * Canonical registry of SynqDrive notification identities.
 * Producers must register new condition codes here before emitting candidates.
 */
export const NOTIFICATION_FINGERPRINT_REGISTRY: readonly NotificationFingerprintRegistryEntry[] = [
  {
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    conditionCode: 'driving_assessment_device_quality',
    domain: 'DRIVING_ANALYSIS',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'LTE_R1 driving assessment device quality degraded/recovering',
  },
  {
    eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
    conditionCode: 'technical_observation_active',
    domain: 'VEHICLE_HEALTH',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'Active technical observation (complaints module)',
  },
  {
    eventType: 'BATTERY_CRITICAL',
    conditionCode: 'battery_critical',
    domain: 'VEHICLE_HEALTH',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'Battery health critical',
  },
  {
    eventType: 'TIRE_CRITICAL',
    conditionCode: 'tires_critical',
    domain: 'VEHICLE_HEALTH',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'Tire health critical',
  },
  {
    eventType: 'BRAKE_CRITICAL',
    conditionCode: 'brakes_critical',
    domain: 'VEHICLE_HEALTH',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'Brake health critical',
  },
  {
    eventType: 'SERVICE_OVERDUE',
    conditionCode: 'overdue',
    domain: 'VEHICLE_HEALTH',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.VEHICLE,
    scopeVersion: 1,
    description: 'Service / TÜV compliance overdue (service_compliance domain)',
  },
  {
    eventType: 'PICKUP_OVERDUE',
    conditionCode: 'pickup_overdue',
    domain: 'HANDOVERS',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.BOOKING,
    scopeVersion: 1,
    description: 'Pickup handover overdue',
  },
  {
    eventType: 'RETURN_OVERDUE',
    conditionCode: 'overdue',
    domain: 'HANDOVERS',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.BOOKING,
    scopeVersion: 1,
    description: 'Return handover overdue',
  },
  {
    eventType: 'STATION_SHORTAGE',
    conditionCode: 'shortage',
    domain: 'OPERATIONS',
    eventKind: 'STATE',
    defaultEntityType: NotificationEntityType.STATION,
    scopeVersion: 1,
    description: 'Station vehicle shortage',
  },
  {
    eventType: 'BOOKING_CREATED',
    conditionCode: 'booking_created',
    domain: 'BOOKINGS',
    eventKind: 'EVENT',
    defaultEntityType: NotificationEntityType.BOOKING,
    scopeVersion: 1,
    description: 'New booking created',
  },
  {
    eventType: 'VEHICLE_RETURNED',
    conditionCode: 'vehicle_returned',
    domain: 'HANDOVERS',
    eventKind: 'EVENT',
    defaultEntityType: NotificationEntityType.BOOKING,
    scopeVersion: 1,
    description: 'Vehicle returned at end of rental',
  },
] as const;

export function lookupFingerprintRegistryEntry(
  eventType: string,
  conditionCode?: string,
): NotificationFingerprintRegistryEntry | undefined {
  return NOTIFICATION_FINGERPRINT_REGISTRY.find(
    (entry) =>
      entry.eventType === eventType
      && (conditionCode == null || entry.conditionCode === conditionCode),
  );
}

export function buildRegisteredFingerprint(
  organizationId: string,
  eventType: string,
  entityId: string,
  overrides?: Partial<Pick<NotificationFingerprintParts, 'entityType' | 'conditionCode' | 'scopeVersion'>>,
) {
  const entry = lookupFingerprintRegistryEntry(eventType, overrides?.conditionCode);
  if (!entry) {
    throw new Error(`Unregistered notification eventType: ${eventType}`);
  }
  return buildNotificationFingerprint({
    organizationId,
    eventType: entry.eventType,
    entityType: overrides?.entityType ?? entry.defaultEntityType,
    entityId,
    conditionCode: overrides?.conditionCode ?? entry.conditionCode,
    scopeVersion: overrides?.scopeVersion ?? entry.scopeVersion,
  });
}

/** WOB L 7503 — Volkswagen Tiguan, driving assessment + technical observation */
export const WOB_L7503_VEHICLE_ID = 'veh-wob-l-7503';
export const WOB_L7503_ORG_ID = 'org-wob-demo';

export function wobDrivingAssessmentFingerprint(organizationId = WOB_L7503_ORG_ID) {
  return buildRegisteredFingerprint(organizationId, 'DRIVING_ASSESSMENT_DEVICE_QUALITY', WOB_L7503_VEHICLE_ID);
}

export function wobTechnicalObservationFingerprint(organizationId = WOB_L7503_ORG_ID) {
  return buildRegisteredFingerprint(organizationId, 'TECHNICAL_OBSERVATION_ACTIVE', WOB_L7503_VEHICLE_ID);
}
