import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import type { NotificationCandidate } from './notification.types';
import { buildNotificationFingerprint } from './notification-fingerprint.factory';
import {
  assertEntityAssignment,
  deriveRecoveryState,
  normalizeNotificationCandidate,
  NOTIFICATION_CANDIDATE_SCHEMA_VERSION,
  NotificationCandidateRecoveryState,
  SOURCE_EVENT_ID_REQUIRED_SYSTEMS,
} from './notification-candidate.contract';
import { logNotificationCandidateRejection } from './notification-candidate.observability';
import {
  NotificationRegistryValidationError,
  validateRegistryCandidate,
} from './registry/notification-event-registry.validator';
import { resolveNotificationEventType } from './registry/notification-event-registry';

export class NotificationCandidateValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationCandidateValidationError';
  }
}

const VALID_ENUM_VALUES = {
  severity: new Set(Object.values(NotificationSeverity)),
  domain: new Set(Object.values(NotificationDomain)),
  entityType: new Set(Object.values(NotificationEntityType)),
  sourceType: new Set(Object.values(NotificationSourceType)),
  actionType: new Set(Object.values(NotificationActionType)),
  eventKind: new Set(Object.values(NotificationEventKind)),
};

const MAX_OBSERVED_SKEW_MS = 24 * 60 * 60 * 1000;

function reject(
  field: string,
  message: string,
  candidate?: Partial<NotificationCandidate>,
): never {
  logNotificationCandidateRejection(
    {
      field,
      reason: message,
      eventType: candidate?.eventType,
      organizationId: candidate?.organizationId,
      sourceSystem: candidate?.sourceSystem ?? candidate?.sourceType,
    },
    candidate,
  );
  throw new NotificationCandidateValidationError(field, message);
}

function assertNonEmpty(
  field: string,
  value: string | undefined | null,
  candidate?: Partial<NotificationCandidate>,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    reject(field, `${field} is required`, candidate);
  }
  return trimmed;
}

function assertEnum<T extends string>(
  field: string,
  value: T,
  allowed: Set<string>,
  candidate?: Partial<NotificationCandidate>,
): void {
  if (!allowed.has(value)) {
    reject(field, `Invalid ${field}: ${value}`, candidate);
  }
}

function assertDate(
  field: string,
  value: Date,
  candidate?: Partial<NotificationCandidate>,
): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    reject(field, `${field} must be a valid Date`, candidate);
  }
}

function assertTemplateKey(
  field: string,
  value: string,
  candidate?: Partial<NotificationCandidate>,
): void {
  const key = assertNonEmpty(field, value, candidate);
  if (!key.startsWith('notification.')) {
    reject(
      field,
      `${field} must be an i18n key starting with "notification."`,
      candidate,
    );
  }
}

function assertTemporalSemantics(candidate: NotificationCandidate): void {
  assertDate('occurredAt', candidate.occurredAt, candidate);
  const observedAt = candidate.observedAt ?? candidate.occurredAt;
  assertDate('observedAt', observedAt, candidate);

  if (observedAt.getTime() < candidate.occurredAt.getTime()) {
    reject(
      'observedAt',
      'observedAt must not be earlier than occurredAt',
      candidate,
    );
  }

  const skew = observedAt.getTime() - candidate.occurredAt.getTime();
  if (skew > MAX_OBSERVED_SKEW_MS) {
    reject(
      'observedAt',
      'observedAt is too far after occurredAt',
      candidate,
    );
  }

  if (candidate.expiresAt) {
    assertDate('expiresAt', candidate.expiresAt, candidate);
    if (candidate.expiresAt.getTime() < candidate.occurredAt.getTime()) {
      reject('expiresAt', 'expiresAt must not be earlier than occurredAt', candidate);
    }
  }
}

function assertRecoverySemantics(candidate: NotificationCandidate): void {
  const isSuccess = candidate.severity === NotificationSeverity.SUCCESS;
  const isRecovered = candidate.recoveryState === NotificationCandidateRecoveryState.RECOVERED;

  if (isSuccess !== isRecovered) {
    reject(
      'recoveryState',
      'recoveryState RECOVERED requires severity SUCCESS and vice versa',
      candidate,
    );
  }

  if (isRecovered && candidate.eventKind === NotificationEventKind.EVENT) {
    reject(
      'recoveryState',
      'EVENT notifications cannot use recovery ingest',
      candidate,
    );
  }
}

function assertSourceEventIdentity(candidate: NotificationCandidate): void {
  const sourceSystem = candidate.sourceSystem ?? candidate.sourceType;
  if (!sourceSystem || !SOURCE_EVENT_ID_REQUIRED_SYSTEMS.has(sourceSystem)) {
    return;
  }
  assertNonEmpty('sourceEventId', candidate.sourceEventId ?? candidate.sourceRef, candidate);
}

function enforceRegistryCandidate(candidate: NotificationCandidate): NotificationCandidate {
  const canonicalEventType = resolveNotificationEventType(candidate.eventType);
  if (!canonicalEventType) {
    reject('eventType', `Unregistered notification eventType: ${candidate.eventType}`, candidate);
  }

  try {
    return validateRegistryCandidate(candidate);
  } catch (err) {
    if (err instanceof NotificationRegistryValidationError) {
      reject(err.field, err.message, candidate);
    }
    throw err;
  }
}

export function validateNotificationCandidate(candidate: NotificationCandidate): NotificationCandidate {
  let normalized: NotificationCandidate;
  try {
    normalized = normalizeNotificationCandidate(candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('metadata')) {
      reject('metadata', message, candidate);
    }
    if (message.includes('entityId') || message.includes('entityType')) {
      reject('entityId', message, candidate);
    }
    reject('candidate', message, candidate);
  }

  const organizationId = assertNonEmpty('organizationId', normalized.organizationId, normalized);
  const eventType = assertNonEmpty('eventType', normalized.eventType, normalized);
  const entityId = assertNonEmpty('entityId', normalized.entityId, normalized);
  const conditionKey = assertNonEmpty('conditionKey', normalized.conditionKey, normalized);
  const sourceEventId = assertNonEmpty('sourceEventId', normalized.sourceEventId, normalized);

  if (normalized.schemaVersion !== NOTIFICATION_CANDIDATE_SCHEMA_VERSION) {
    reject(
      'schemaVersion',
      `schemaVersion must be ${NOTIFICATION_CANDIDATE_SCHEMA_VERSION}`,
      normalized,
    );
  }

  assertEnum('severity', normalized.severity, VALID_ENUM_VALUES.severity, normalized);
  assertEnum('domain', normalized.domain, VALID_ENUM_VALUES.domain, normalized);
  assertEnum('entityType', normalized.entityType, VALID_ENUM_VALUES.entityType, normalized);
  assertEnum(
    'sourceSystem',
    normalized.sourceSystem ?? normalized.sourceType,
    VALID_ENUM_VALUES.sourceType,
    normalized,
  );
  assertEnum('actionType', normalized.actionType, VALID_ENUM_VALUES.actionType, normalized);
  assertEnum('eventKind', normalized.eventKind, VALID_ENUM_VALUES.eventKind, normalized);

  assertTemporalSemantics(normalized);
  assertRecoverySemantics(normalized);
  assertSourceEventIdentity(normalized);

  try {
    assertEntityAssignment(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reject('entityType', message, normalized);
  }

  assertTemplateKey('templateKey', normalized.templateKey ?? normalized.titleKey, normalized);
  assertTemplateKey('bodyKey', normalized.bodyKey, normalized);

  if (!normalized.templateParams || typeof normalized.templateParams !== 'object') {
    reject('templateParams', 'templateParams must be an object', normalized);
  }

  if (!normalized.resolutionPolicy?.eventKind) {
    reject('resolutionPolicy', 'resolutionPolicy.eventKind is required', normalized);
  }

  if (!normalized.actionTarget?.type) {
    reject('actionTarget', 'actionTarget.type is required', normalized);
  }

  const structurallyValid: NotificationCandidate = {
    ...normalized,
    organizationId,
    eventType,
    entityId,
    conditionKey,
    conditionCode: conditionKey,
    sourceEventId,
    sourceRef: sourceEventId,
    recoveryState: normalized.recoveryState ?? deriveRecoveryState(normalized.severity),
    scopeVersion: normalized.scopeVersion ?? 1,
  };

  buildNotificationFingerprint({
    organizationId,
    eventType: resolveNotificationEventType(eventType) ?? eventType,
    entityType: structurallyValid.entityType,
    entityId,
    conditionCode: conditionKey,
    scopeVersion: structurallyValid.scopeVersion ?? 1,
  });

  return enforceRegistryCandidate(structurallyValid);
}

export function fingerprintFromCandidate(
  candidate: NotificationCandidate,
): ReturnType<typeof buildNotificationFingerprint> {
  const normalized = validateNotificationCandidate(candidate);
  return buildNotificationFingerprint({
    organizationId: normalized.organizationId,
    eventType: normalized.eventType,
    entityType: normalized.entityType,
    entityId: normalized.entityId,
    conditionCode: normalized.conditionCode,
    scopeVersion: normalized.scopeVersion ?? 1,
  });
}
