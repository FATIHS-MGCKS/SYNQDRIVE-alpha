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

function logRegistryRejection(eventType: string, field: string, message: string): void {
  const payload = {
    level: 'error',
    component: 'notification-registry',
    eventType,
    field,
    message,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  };
  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(payload));
  }
}

function assertNonEmpty(field: string, value: string | undefined | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new NotificationCandidateValidationError(field, `${field} is required`);
  }
  return trimmed;
}

function assertEnum<T extends string>(
  field: string,
  value: T,
  allowed: Set<string>,
): void {
  if (!allowed.has(value)) {
    throw new NotificationCandidateValidationError(field, `Invalid ${field}: ${value}`);
  }
}

function assertDate(field: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new NotificationCandidateValidationError(field, `${field} must be a valid Date`);
  }
}

function assertTemplateKey(field: string, value: string): void {
  const key = assertNonEmpty(field, value);
  if (!key.startsWith('notification.')) {
    throw new NotificationCandidateValidationError(
      field,
      `${field} must be an i18n key starting with "notification."`,
    );
  }
}

function enforceRegistryCandidate(candidate: NotificationCandidate): NotificationCandidate {
  const canonicalEventType = resolveNotificationEventType(candidate.eventType);
  if (!canonicalEventType) {
    const message = `Unregistered notification eventType: ${candidate.eventType}`;
    logRegistryRejection(candidate.eventType, 'eventType', message);
    throw new NotificationCandidateValidationError('eventType', message);
  }

  try {
    return validateRegistryCandidate(candidate);
  } catch (err) {
    if (err instanceof NotificationRegistryValidationError) {
      logRegistryRejection(candidate.eventType, err.field, err.message);
      throw new NotificationCandidateValidationError(err.field, err.message);
    }
    throw err;
  }
}

export function validateNotificationCandidate(candidate: NotificationCandidate): NotificationCandidate {
  const organizationId = assertNonEmpty('organizationId', candidate.organizationId);
  const eventType = assertNonEmpty('eventType', candidate.eventType);
  const entityId = assertNonEmpty('entityId', candidate.entityId);
  const conditionCode = assertNonEmpty('conditionCode', candidate.conditionCode);
  const sourceRef = assertNonEmpty('sourceRef', candidate.sourceRef);

  assertEnum('severity', candidate.severity, VALID_ENUM_VALUES.severity);
  assertEnum('domain', candidate.domain, VALID_ENUM_VALUES.domain);
  assertEnum('entityType', candidate.entityType, VALID_ENUM_VALUES.entityType);
  assertEnum('sourceType', candidate.sourceType, VALID_ENUM_VALUES.sourceType);
  assertEnum('actionType', candidate.actionType, VALID_ENUM_VALUES.actionType);
  assertEnum('eventKind', candidate.eventKind, VALID_ENUM_VALUES.eventKind);

  assertDate('occurredAt', candidate.occurredAt);
  if (candidate.expiresAt) {
    assertDate('expiresAt', candidate.expiresAt);
  }

  assertTemplateKey('titleKey', candidate.titleKey);
  assertTemplateKey('bodyKey', candidate.bodyKey);

  if (!candidate.templateParams || typeof candidate.templateParams !== 'object') {
    throw new NotificationCandidateValidationError('templateParams', 'templateParams must be an object');
  }

  if (!candidate.resolutionPolicy?.eventKind) {
    throw new NotificationCandidateValidationError(
      'resolutionPolicy',
      'resolutionPolicy.eventKind is required',
    );
  }

  if (!candidate.actionTarget?.type) {
    throw new NotificationCandidateValidationError('actionTarget', 'actionTarget.type is required');
  }

  const structurallyValid: NotificationCandidate = {
    ...candidate,
    organizationId,
    eventType,
    entityId,
    conditionCode,
    sourceRef,
    scopeVersion: candidate.scopeVersion ?? 1,
  };

  buildNotificationFingerprint({
    organizationId,
    eventType: resolveNotificationEventType(eventType) ?? eventType,
    entityType: structurallyValid.entityType,
    entityId,
    conditionCode,
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
