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

  // Fingerprint must be buildable without localized text
  buildNotificationFingerprint({
    organizationId,
    eventType,
    entityType: candidate.entityType,
    entityId,
    conditionCode,
    scopeVersion: candidate.scopeVersion ?? 1,
  });

  return {
    ...candidate,
    organizationId,
    eventType,
    entityId,
    conditionCode,
    sourceRef,
    scopeVersion: candidate.scopeVersion ?? 1,
  };
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
