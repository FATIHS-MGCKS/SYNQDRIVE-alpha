import { NotificationEntityType } from './notification.enums';
import type { NotificationFingerprintParts } from './notification.types';
import { buildNotificationFingerprint } from './notification-fingerprint.factory';
import {
  buildRegistryFingerprint,
  getEventTypeDefinition,
  NOTIFICATION_EVENT_REGISTRY,
} from './registry/notification-event-registry';

/** @deprecated Use NotificationEventTypeDefinition from event registry */
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
 * Legacy view of the canonical event registry — kept for backward compatibility.
 */
export const NOTIFICATION_FINGERPRINT_REGISTRY: readonly NotificationFingerprintRegistryEntry[] =
  NOTIFICATION_EVENT_REGISTRY.map((def) => ({
    eventType: def.eventType,
    conditionCode: def.conditionCode,
    domain: def.domain,
    eventKind: def.eventKind,
    defaultEntityType: def.defaultEntityType,
    scopeVersion: def.fingerprintVersion,
    description: `${def.producerModule}: ${def.slug}`,
  }));

export function lookupFingerprintRegistryEntry(
  eventType: string,
  conditionCode?: string,
): NotificationFingerprintRegistryEntry | undefined {
  const def = getEventTypeDefinition(eventType);
  if (!def) return undefined;
  if (conditionCode != null && conditionCode !== def.conditionCode) return undefined;
  return {
    eventType: def.eventType,
    conditionCode: def.conditionCode,
    domain: def.domain,
    eventKind: def.eventKind,
    defaultEntityType: def.defaultEntityType,
    scopeVersion: def.fingerprintVersion,
    description: `${def.producerModule}: ${def.slug}`,
  };
}

export function buildRegisteredFingerprint(
  organizationId: string,
  eventType: string,
  entityId: string,
  overrides?: Partial<Pick<NotificationFingerprintParts, 'entityType' | 'conditionCode' | 'scopeVersion'>>,
) {
  if (overrides?.conditionCode) {
    return buildNotificationFingerprint({
      organizationId,
      eventType,
      entityType: overrides.entityType ?? NotificationEntityType.VEHICLE,
      entityId,
      conditionCode: overrides.conditionCode,
      scopeVersion: overrides.scopeVersion ?? 1,
    });
  }
  return buildRegistryFingerprint(
    organizationId,
    eventType,
    entityId,
    overrides?.entityType,
  );
}

export const WOB_L7503_VEHICLE_ID = 'veh-wob-l-7503';
export const WOB_L7503_ORG_ID = 'org-wob-demo';

export function wobDrivingAssessmentFingerprint(organizationId = WOB_L7503_ORG_ID) {
  return buildRegisteredFingerprint(organizationId, 'DRIVING_ASSESSMENT_DEVICE_QUALITY', WOB_L7503_VEHICLE_ID);
}

export function wobTechnicalObservationFingerprint(organizationId = WOB_L7503_ORG_ID) {
  return buildRegisteredFingerprint(organizationId, 'TECHNICAL_OBSERVATION_ACTIVE', WOB_L7503_VEHICLE_ID);
}
