import { NotificationEntityType } from './notification.enums';
import type { NotificationFingerprintParts } from './notification.types';

/** Characters forbidden in fingerprint components (locale/UI/time noise). */
const FORBIDDEN_FINGERPRINT_PATTERNS = [
  /\s{2,}/,
  /vor\s+\d+/i,
  /ago$/i,
  /\/dashboard\//i,
  /\/vehicles\//i,
  /Date\.now/i,
];

const FINGERPRINT_DELIMITER = '|';

export class NotificationFingerprintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationFingerprintError';
  }
}

function assertFingerprintPart(name: string, value: string): void {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new NotificationFingerprintError(`Fingerprint part "${name}" must be non-empty`);
  }
  if (trimmed.includes(FINGERPRINT_DELIMITER)) {
    throw new NotificationFingerprintError(`Fingerprint part "${name}" must not contain "${FINGERPRINT_DELIMITER}"`);
  }
  for (const pattern of FORBIDDEN_FINGERPRINT_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new NotificationFingerprintError(`Fingerprint part "${name}" contains forbidden pattern`);
    }
  }
}

export function serializeNotificationFingerprint(parts: NotificationFingerprintParts): string {
  assertFingerprintPart('organizationId', parts.organizationId);
  assertFingerprintPart('eventType', parts.eventType);
  assertFingerprintPart('entityId', parts.entityId);
  assertFingerprintPart('conditionCode', parts.conditionCode);

  const version = parts.scopeVersion ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new NotificationFingerprintError('scopeVersion must be a positive integer');
  }

  return [
    parts.organizationId,
    parts.eventType,
    parts.entityType,
    parts.entityId,
    parts.conditionCode,
    `v${version}`,
  ].join(FINGERPRINT_DELIMITER);
}

export function buildNotificationFingerprint(
  parts: NotificationFingerprintParts,
): { parts: NotificationFingerprintParts; canonical: string } {
  const scopeVersion = parts.scopeVersion ?? 1;
  const normalized: NotificationFingerprintParts = {
    ...parts,
    eventType: parts.eventType.trim(),
    entityId: parts.entityId.trim(),
    conditionCode: parts.conditionCode.trim(),
    scopeVersion,
  };
  return {
    parts: normalized,
    canonical: serializeNotificationFingerprint(normalized),
  };
}

export function parseNotificationFingerprint(canonical: string): NotificationFingerprintParts {
  const segments = canonical.split(FINGERPRINT_DELIMITER);
  if (segments.length !== 6) {
    throw new NotificationFingerprintError(`Invalid fingerprint segment count: ${segments.length}`);
  }
  const [organizationId, eventType, entityType, entityId, conditionCode, versionTag] = segments;
  if (!versionTag.startsWith('v')) {
    throw new NotificationFingerprintError('Missing scope version tag');
  }
  const scopeVersion = parseInt(versionTag.slice(1), 10);
  if (!Number.isFinite(scopeVersion) || scopeVersion < 1) {
    throw new NotificationFingerprintError('Invalid scopeVersion');
  }
  return {
    organizationId,
    eventType,
    entityType: entityType as NotificationFingerprintParts['entityType'],
    entityId,
    conditionCode,
    scopeVersion,
  };
}

/**
 * Maps legacy DashboardInsight `dedupeKey` (type:entityId) into canonical fingerprint parts.
 * DashboardInsight remains a producer — this is a bridge helper, not a rename.
 */
export function fingerprintPartsFromInsightDedupeKey(
  organizationId: string,
  dedupeKey: string,
  entityType: NotificationEntityType = NotificationEntityType.VEHICLE,
  scopeVersion = 1,
): NotificationFingerprintParts {
  const colon = dedupeKey.indexOf(':');
  if (colon <= 0) {
    throw new NotificationFingerprintError(`Invalid insight dedupeKey format: ${dedupeKey}`);
  }
  const conditionCode = dedupeKey.slice(0, colon);
  const entityId = dedupeKey.slice(colon + 1);
  return {
    organizationId,
    eventType: conditionCode.toUpperCase(),
    entityType,
    entityId,
    conditionCode,
    scopeVersion,
  };
}

/** Semantic key used by frontend operational issues: entity:type:domain:code */
export function fingerprintPartsFromSemanticKey(
  organizationId: string,
  semanticKey: string,
  eventType: string,
  scopeVersion = 1,
): NotificationFingerprintParts {
  const segments = semanticKey.split(':');
  if (segments.length < 4) {
    throw new NotificationFingerprintError(`Invalid semanticKey format: ${semanticKey}`);
  }
  const [entityTypeRaw, entityId, , conditionCode] = segments;
  const entityType = entityTypeRaw.toUpperCase() as NotificationFingerprintParts['entityType'];
  return {
    organizationId,
    eventType,
    entityType,
    entityId,
    conditionCode,
    scopeVersion,
  };
}
