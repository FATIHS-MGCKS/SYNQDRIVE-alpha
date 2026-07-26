import { createHash } from 'node:crypto';
import { NotificationEntityType } from './notification.enums';
import type { NotificationFingerprintParts, NormalizedNotificationFingerprintParts } from './notification.types';
import {
  FINGERPRINT_HASH_ALGORITHM,
  normalizeFingerprintIdentity,
  serializeFingerprintIdentity,
  type NormalizedFingerprintIdentity,
} from './notification-fingerprint.normalizer';

export class NotificationFingerprintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationFingerprintError';
  }
}

function toFingerprintParts(identity: NormalizedFingerprintIdentity): NormalizedNotificationFingerprintParts {
  return {
    organizationId: identity.organizationId,
    eventType: identity.eventType,
    entityType: identity.entityType,
    entityId: identity.entityId,
    conditionKey: identity.conditionKey,
    conditionCode: identity.conditionKey,
    schemaVersion: identity.schemaVersion,
    scopeVersion: identity.schemaVersion,
  };
}

export function hashFingerprintCanonical(canonical: string): string {
  return createHash(FINGERPRINT_HASH_ALGORITHM).update(canonical, 'utf8').digest('hex');
}

export function serializeNotificationFingerprint(parts: NotificationFingerprintParts): string {
  const identity = normalizeFingerprintIdentity({
    organizationId: parts.organizationId,
    eventType: parts.eventType,
    entityType: parts.entityType,
    entityId: parts.entityId,
    conditionKey: parts.conditionKey ?? parts.conditionCode,
    schemaVersion: parts.schemaVersion ?? parts.scopeVersion,
    scopeVersion: parts.scopeVersion,
  });
  return serializeFingerprintIdentity(identity);
}

export function buildNotificationFingerprint(
  parts: NotificationFingerprintParts,
): { parts: NormalizedNotificationFingerprintParts; canonical: string; digest: string } {
  const identity = normalizeFingerprintIdentity({
    organizationId: parts.organizationId,
    eventType: parts.eventType,
    entityType: parts.entityType,
    entityId: parts.entityId,
    conditionKey: parts.conditionKey ?? parts.conditionCode,
    schemaVersion: parts.schemaVersion ?? parts.scopeVersion,
    scopeVersion: parts.scopeVersion,
  });
  const canonical = serializeFingerprintIdentity(identity);
  const digest = hashFingerprintCanonical(canonical);
  return {
    parts: toFingerprintParts(identity),
    canonical,
    digest,
  };
}

export function parseNotificationFingerprint(canonical: string): NormalizedNotificationFingerprintParts {
  const segments = canonical.split('|');
  if (segments.length !== 6) {
    throw new NotificationFingerprintError(`Invalid fingerprint segment count: ${segments.length}`);
  }
  const [organizationId, eventType, entityType, entityId, conditionKey, versionTag] = segments;
  if (!versionTag.startsWith('v')) {
    throw new NotificationFingerprintError('Missing schema version tag');
  }
  const schemaVersion = parseInt(versionTag.slice(1), 10);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    throw new NotificationFingerprintError('Invalid schemaVersion');
  }

  return toFingerprintParts(
    normalizeFingerprintIdentity({
      organizationId,
      eventType,
      entityType: entityType as NotificationEntityType,
      entityId,
      conditionKey,
      schemaVersion,
    }),
  );
}

/**
 * Maps legacy DashboardInsight `dedupeKey` (type:entityId) into canonical fingerprint parts.
 * DashboardInsight remains a producer — this is a bridge helper, not a rename.
 */
export function fingerprintPartsFromInsightDedupeKey(
  organizationId: string,
  dedupeKey: string,
  entityType: NotificationEntityType = NotificationEntityType.VEHICLE,
  schemaVersion = 1,
): NormalizedNotificationFingerprintParts {
  const colon = dedupeKey.indexOf(':');
  if (colon <= 0) {
    throw new NotificationFingerprintError(`Invalid insight dedupeKey format: ${dedupeKey}`);
  }
  const conditionKey = dedupeKey.slice(0, colon);
  const entityId = dedupeKey.slice(colon + 1);
  return buildNotificationFingerprint({
    organizationId,
    eventType: conditionKey.toUpperCase(),
    entityType,
    entityId,
    conditionKey,
    conditionCode: conditionKey,
    schemaVersion,
  }).parts;
}

/** Semantic key used by frontend operational issues: entity:type:domain:code */
export function fingerprintPartsFromSemanticKey(
  organizationId: string,
  semanticKey: string,
  eventType: string,
  schemaVersion = 1,
): NormalizedNotificationFingerprintParts {
  const segments = semanticKey.split(':');
  if (segments.length < 4) {
    throw new NotificationFingerprintError(`Invalid semanticKey format: ${semanticKey}`);
  }
  const [entityTypeRaw, entityId, , conditionKey] = segments;
  return buildNotificationFingerprint({
    organizationId,
    eventType,
    entityType: entityTypeRaw.toUpperCase() as NotificationEntityType,
    entityId,
    conditionKey,
    conditionCode: conditionKey,
    schemaVersion,
  }).parts;
}
