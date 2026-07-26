import { NotificationEntityType } from './notification.enums';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Characters forbidden in fingerprint identity components. */
export const FORBIDDEN_FINGERPRINT_PATTERNS = [
  /\s{2,}/,
  /vor\s+\d+/i,
  /\bago\b/i,
  /\/dashboard\//i,
  /\/vehicles\//i,
  /Date\.now/i,
  /notification\.title\./i,
  /notification\.body\./i,
] as const;

export const FINGERPRINT_FIELD_ORDER = [
  'organizationId',
  'eventType',
  'entityType',
  'entityId',
  'conditionKey',
  'schemaVersion',
] as const;

export const FINGERPRINT_DELIMITER = '|';
export const FINGERPRINT_HASH_ALGORITHM = 'sha256' as const;

export class NotificationFingerprintNormalizationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationFingerprintNormalizationError';
  }
}

function assertNonEmpty(field: string, value: string | null | undefined): string {
  const normalized = normalizeUnicode(value ?? '');
  if (!normalized) {
    throw new NotificationFingerprintNormalizationError(field, `${field} must be non-empty`);
  }
  return normalized;
}

export function normalizeUnicode(value: string): string {
  return value.normalize('NFC').trim();
}

export function normalizeOrganizationId(value: string): string {
  return assertNonEmpty('organizationId', value);
}

export function normalizeEventType(value: string): string {
  const normalized = assertNonEmpty('eventType', value).toUpperCase();
  if (/\s/.test(normalized)) {
    throw new NotificationFingerprintNormalizationError('eventType', 'eventType must not contain whitespace');
  }
  return normalized;
}

export function normalizeEntityType(value: NotificationEntityType): NotificationEntityType {
  const normalized = assertNonEmpty('entityType', value).toUpperCase() as NotificationEntityType;
  if (!Object.values(NotificationEntityType).includes(normalized)) {
    throw new NotificationFingerprintNormalizationError('entityType', `Invalid entityType: ${value}`);
  }
  return normalized;
}

export function normalizeEntityId(value: string): string {
  const normalized = assertNonEmpty('entityId', value);
  if (UUID_RE.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function normalizeConditionKey(value: string): string {
  const normalized = assertNonEmpty('conditionKey', value);
  const colon = normalized.indexOf(':');
  if (colon === -1) {
    return normalized.toLowerCase();
  }
  const base = normalized.slice(0, colon).toLowerCase();
  const variant = normalized.slice(colon + 1).trim();
  if (!variant) {
    throw new NotificationFingerprintNormalizationError('conditionKey', 'conditionKey variant must be non-empty');
  }
  return `${base}:${variant}`;
}

export function normalizeFingerprintSchemaVersion(value: number | null | undefined): number {
  const version = value ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new NotificationFingerprintNormalizationError(
      'schemaVersion',
      'schemaVersion must be a positive integer',
    );
  }
  return version;
}

export function assertFingerprintPartSafe(field: string, value: string): void {
  if (value.includes(FINGERPRINT_DELIMITER)) {
    throw new NotificationFingerprintNormalizationError(
      field,
      `${field} must not contain delimiter "${FINGERPRINT_DELIMITER}"`,
    );
  }
  for (const pattern of FORBIDDEN_FINGERPRINT_PATTERNS) {
    if (pattern.test(value)) {
      throw new NotificationFingerprintNormalizationError(
        field,
        `${field} contains forbidden fingerprint pattern`,
      );
    }
  }
}

export interface NormalizedFingerprintIdentity {
  organizationId: string;
  eventType: string;
  entityType: NotificationEntityType;
  entityId: string;
  conditionKey: string;
  schemaVersion: number;
}

export function normalizeFingerprintIdentity(input: {
  organizationId: string;
  eventType: string;
  entityType: NotificationEntityType;
  entityId: string;
  conditionKey?: string;
  conditionCode?: string;
  schemaVersion?: number;
  scopeVersion?: number;
}): NormalizedFingerprintIdentity {
  const conditionKey = normalizeConditionKey(input.conditionKey ?? input.conditionCode ?? '');
  const schemaVersion = normalizeFingerprintSchemaVersion(input.schemaVersion ?? input.scopeVersion);

  const identity: NormalizedFingerprintIdentity = {
    organizationId: normalizeOrganizationId(input.organizationId),
    eventType: normalizeEventType(input.eventType),
    entityType: normalizeEntityType(input.entityType),
    entityId: normalizeEntityId(input.entityId),
    conditionKey,
    schemaVersion,
  };

  for (const field of FINGERPRINT_FIELD_ORDER) {
    assertFingerprintPartSafe(field, String(identity[field]));
  }

  return identity;
}

export function serializeFingerprintIdentity(identity: NormalizedFingerprintIdentity): string {
  return [
    identity.organizationId,
    identity.eventType,
    identity.entityType,
    identity.entityId,
    identity.conditionKey,
    `v${identity.schemaVersion}`,
  ].join(FINGERPRINT_DELIMITER);
}
