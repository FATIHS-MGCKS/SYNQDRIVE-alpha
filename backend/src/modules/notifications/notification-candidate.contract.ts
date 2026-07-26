import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import type { NotificationActionTarget, NotificationCandidate, NotificationTemplateParams } from './notification.types';

/** Current NotificationCandidate ingest contract version — bump only on breaking shape changes. */
export const NOTIFICATION_CANDIDATE_SCHEMA_VERSION = 1;

export enum NotificationCandidateRecoveryState {
  ACTIVE = 'ACTIVE',
  RECOVERED = 'RECOVERED',
}

/** Producer systems that must supply an opaque sourceEventId (webhook/runtime/external). */
export const SOURCE_EVENT_ID_REQUIRED_SYSTEMS = new Set<NotificationSourceType>([
  NotificationSourceType.RUNTIME,
  NotificationSourceType.SYSTEM,
  NotificationSourceType.WORKFLOW,
]);

/** Metadata keys allowed on candidates — unknown keys are rejected. */
export const NOTIFICATION_CANDIDATE_METADATA_ALLOWLIST = new Set([
  'adapterId',
  'bookedOut',
  'causationId',
  'categoryKey',
  'cleared',
  'codes',
  'complaintId',
  'correlationId',
  'dedupeKey',
  'deviceBindingId',
  'episodeId',
  'gateCode',
  'groupKey',
  'insightPriority',
  'integrationName',
  'legalDocumentId',
  'objectKey',
  'observationId',
  'provider',
  'reason',
  'reasons',
  'blockingReasons',
  'recoverySource',
  'resolutionMethod',
  'resolved',
  'resolvedBy',
  'runId',
  'scanStatus',
  'scope',
  'settingsTab',
  'stateVersion',
  'webhookId',
]);

/** Metadata keys that may contain string arrays (non-PII operational codes). */
export const NOTIFICATION_CANDIDATE_METADATA_ARRAY_KEYS = new Set([
  'reasons',
  'blockingReasons',
  'codes',
]);

/** Metadata keys that must never carry PII — values belong in controlled templateParams only. */
export const NOTIFICATION_CANDIDATE_METADATA_PII_DENYLIST = new Set([
  'address',
  'customerName',
  'dateOfBirth',
  'email',
  'firstName',
  'fullName',
  'iban',
  'lastName',
  'phone',
  'phoneNumber',
  'postalCode',
  'street',
]);

export type NotificationCandidateMetadata = Partial<
  Record<
    | 'adapterId'
    | 'causationId'
    | 'complaintId'
    | 'correlationId'
    | 'dedupeKey'
    | 'deviceBindingId'
    | 'episodeId'
    | 'groupKey'
    | 'insightPriority'
    | 'integrationName'
    | 'observationId'
    | 'provider'
    | 'recoverySource'
    | 'resolutionMethod'
    | 'resolvedBy'
    | 'runId'
    | 'stateVersion'
    | 'webhookId',
    string | number | boolean | null
  >
>;

export function deriveRecoveryState(
  severity: NotificationSeverity,
): NotificationCandidateRecoveryState {
  return severity === NotificationSeverity.SUCCESS
    ? NotificationCandidateRecoveryState.RECOVERED
    : NotificationCandidateRecoveryState.ACTIVE;
}

function readEntityRefs(
  candidate: NotificationCandidate,
  actionTarget?: NotificationActionTarget,
): Pick<
  NotificationCandidate,
  'vehicleId' | 'bookingId' | 'stationId' | 'customerId' | 'userId'
> {
  const target = actionTarget ?? candidate.actionTarget;
  return {
    vehicleId: candidate.vehicleId ?? target?.vehicleId,
    bookingId: candidate.bookingId ?? target?.bookingId,
    stationId: candidate.stationId ?? target?.stationId,
    customerId: candidate.customerId ?? target?.customerId,
    userId: candidate.userId,
  };
}

export function sanitizeCandidateMetadata(
  metadata: Record<string, unknown> | undefined,
): NotificationCandidateMetadata | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;

  const sanitized: NotificationCandidateMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (NOTIFICATION_CANDIDATE_METADATA_PII_DENYLIST.has(key)) {
      throw new Error(`PII metadata key not allowed: ${key}`);
    }
    if (!NOTIFICATION_CANDIDATE_METADATA_ALLOWLIST.has(key)) {
      throw new Error(`Unknown metadata key not allowed: ${key}`);
    }
    if (value === null) {
      (sanitized as Record<string, string | number | boolean | null | string[]>)[key] = null;
      continue;
    }
    if (
      NOTIFICATION_CANDIDATE_METADATA_ARRAY_KEYS.has(key)
      && Array.isArray(value)
      && value.every((entry) => typeof entry === 'string')
    ) {
      (sanitized as Record<string, string | number | boolean | null | string[]>)[key] = value;
      continue;
    }
    if (
      typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      throw new Error(`Metadata value for ${key} must be primitive`);
    }
    (sanitized as Record<string, string | number | boolean | null>)[key] = value as
      | string
      | number
      | boolean;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Canonicalizes legacy producer fields into the strict NotificationCandidate contract.
 * Keeps legacy aliases (sourceType/sourceRef/conditionCode/titleKey) in sync for materialization.
 */
export function normalizeNotificationCandidate(
  candidate: NotificationCandidate,
): NotificationCandidate {
  const sourceSystem = candidate.sourceSystem ?? candidate.sourceType;
  const sourceEventId = (candidate.sourceEventId ?? candidate.sourceRef)?.trim();
  const conditionKey = (candidate.conditionKey ?? candidate.conditionCode)?.trim();
  const templateKey = (candidate.templateKey ?? candidate.titleKey)?.trim();
  const bodyKey = candidate.bodyKey?.trim();
  const schemaVersion = candidate.schemaVersion ?? NOTIFICATION_CANDIDATE_SCHEMA_VERSION;
  const observedAt = candidate.observedAt ?? candidate.occurredAt;
  const recoveryState = candidate.recoveryState ?? deriveRecoveryState(candidate.severity);
  const entityRefs = readEntityRefs(candidate);
  const correlationId = candidate.correlationId ?? candidate.metadata?.correlationId as string | undefined;
  const causationId = candidate.causationId ?? candidate.metadata?.causationId as string | undefined;

  const metadata = sanitizeCandidateMetadata({
    ...candidate.metadata,
    ...(correlationId ? { correlationId } : {}),
    ...(causationId ? { causationId } : {}),
  });

  return {
    ...candidate,
    schemaVersion,
    sourceSystem,
    sourceType: sourceSystem,
    sourceEventId: sourceEventId ?? '',
    sourceRef: sourceEventId ?? '',
    conditionKey: conditionKey ?? '',
    conditionCode: conditionKey ?? '',
    templateKey: templateKey ?? '',
    titleKey: templateKey ?? '',
    bodyKey: bodyKey ?? '',
    observedAt,
    recoveryState,
    correlationId,
    causationId,
    ...entityRefs,
    metadata,
    templateParams: (candidate.templateParams ?? {}) as NotificationTemplateParams,
    scopeVersion: candidate.scopeVersion ?? 1,
  };
}

export function assertEntityAssignment(candidate: NotificationCandidate): void {
  const needsEntityId =
    candidate.entityType !== NotificationEntityType.ORGANIZATION
    && candidate.entityType !== NotificationEntityType.FLEET;

  if (needsEntityId && !candidate.entityId?.trim()) {
    throw new Error('entityId is required for entity-scoped notifications');
  }

  const pairs: Array<[NotificationEntityType, string | undefined, string]> = [
    [NotificationEntityType.VEHICLE, candidate.vehicleId, 'vehicleId'],
    [NotificationEntityType.BOOKING, candidate.bookingId, 'bookingId'],
    [NotificationEntityType.STATION, candidate.stationId, 'stationId'],
    [NotificationEntityType.CUSTOMER, candidate.customerId, 'customerId'],
  ];

  for (const [type, refId, field] of pairs) {
    if (candidate.entityType !== type) continue;
    if (refId && refId !== candidate.entityId) {
      throw new Error(`${field} must match entityId for ${type} entityType`);
    }
  }
}
