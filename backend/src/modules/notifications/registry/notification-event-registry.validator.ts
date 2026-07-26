import type { NotificationCandidate } from '../notification.types';
import { NotificationSeverity } from '../notification.enums';
import {
  getEventTypeDefinition,
  NotificationEventRegistryError,
  requireEventTypeDefinition,
  resolveNotificationEventType,
} from './notification-event-registry';
import type { RegistryCandidateBuildInput } from './notification-event-registry.types';

export class NotificationRegistryValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationRegistryValidationError';
  }
}

function assertRequiredTemplateParams(
  def: ReturnType<typeof requireEventTypeDefinition>,
  templateParams: Record<string, unknown>,
) {
  for (const key of def.requiredTemplateParams) {
    const value = templateParams[key];
    if (value === undefined || value === null || value === '') {
      throw new NotificationRegistryValidationError(
        `templateParams.${key}`,
        `Missing required template param "${key}" for eventType ${def.eventType}`,
      );
    }
  }
}

function assertActionTargetComplete(
  def: ReturnType<typeof requireEventTypeDefinition>,
  candidate: NotificationCandidate,
) {
  if (!def.requiresNavigation) return;

  const { actionTarget, entityId, entityType } = candidate;
  if (!actionTarget?.type) {
    throw new NotificationRegistryValidationError(
      'actionTarget',
      `actionTarget.type required for navigable eventType ${def.eventType}`,
    );
  }

  const needsEntityId = entityType !== 'ORGANIZATION' && entityType !== 'FLEET';
  if (needsEntityId && !entityId?.trim()) {
    throw new NotificationRegistryValidationError(
      'entityId',
      `entityId required for eventType ${def.eventType}`,
    );
  }

  if (def.actionType === candidate.actionType) {
    const hasNavRef =
      actionTarget.vehicleId
      || actionTarget.bookingId
      || actionTarget.stationId
      || actionTarget.invoiceId
      || actionTarget.tripId
      || !def.requiresNavigation;
    if (!hasNavRef && needsEntityId) {
      throw new NotificationRegistryValidationError(
        'actionTarget',
        `Incomplete action target for eventType ${def.eventType}`,
      );
    }
  }
}

function assertSeverityAllowed(
  def: ReturnType<typeof requireEventTypeDefinition>,
  severity: NotificationSeverity,
) {
  if (severity === NotificationSeverity.SUCCESS) return;
  if (!def.allowedSeverityEscalations.includes(severity)) {
    throw new NotificationRegistryValidationError(
      'severity',
      `Severity ${severity} not allowed for eventType ${def.eventType}`,
    );
  }
}

export function validateRegistryCandidate(candidate: NotificationCandidate): NotificationCandidate {
  const canonicalEventType = resolveNotificationEventType(candidate.eventType);
  if (!canonicalEventType) {
    throw new NotificationRegistryValidationError(
      'eventType',
      `Unregistered notification eventType: ${candidate.eventType}`,
    );
  }

  const normalizedCandidate =
    canonicalEventType === candidate.eventType
      ? candidate
      : { ...candidate, eventType: canonicalEventType };

  const def = requireEventTypeDefinition(normalizedCandidate.eventType);

  if (normalizedCandidate.domain !== def.domain) {
    throw new NotificationRegistryValidationError(
      'domain',
      `domain mismatch for ${def.eventType}: expected ${def.domain}, got ${normalizedCandidate.domain}`,
    );
  }

  const conditionMatches =
    normalizedCandidate.conditionCode === def.conditionCode
    || (def.eventType === 'TECHNICAL_OBSERVATION_ACTIVE'
      && normalizedCandidate.conditionCode.startsWith(`${def.conditionCode}:`))
    || (def.eventType === 'ACTIVE_DTC'
      && normalizedCandidate.conditionCode.startsWith(`${def.conditionCode}:`))
    || (normalizedCandidate.conditionCode.startsWith(`${def.conditionCode}:`));
  if (!conditionMatches) {
    throw new NotificationRegistryValidationError(
      'conditionCode',
      `conditionCode mismatch for ${def.eventType}: expected ${def.conditionCode}`,
    );
  }

  if (normalizedCandidate.eventKind !== def.eventKind) {
    throw new NotificationRegistryValidationError(
      'eventKind',
      `eventKind mismatch for ${def.eventType}: expected ${def.eventKind}`,
    );
  }

  if (!normalizedCandidate.titleKey.startsWith('notification.')) {
    throw new NotificationRegistryValidationError('titleKey', 'titleKey must start with notification.');
  }

  const titleMatchesRegistry =
    normalizedCandidate.titleKey === def.titleKey
    || normalizedCandidate.severity === NotificationSeverity.SUCCESS;
  if (!titleMatchesRegistry) {
    throw new NotificationRegistryValidationError(
      'titleKey',
      `titleKey must match registry for ${def.eventType}`,
    );
  }

  assertRequiredTemplateParams(def, normalizedCandidate.templateParams ?? {});
  assertSeverityAllowed(def, normalizedCandidate.severity);
  assertActionTargetComplete(def, normalizedCandidate);

  return normalizedCandidate;
}

export function validateRegistryBuildInput(input: RegistryCandidateBuildInput): RegistryCandidateBuildInput {
  if (!resolveNotificationEventType(input.eventType)) {
    throw new NotificationRegistryValidationError('eventType', `Unregistered eventType: ${input.eventType}`);
  }
  const def = requireEventTypeDefinition(input.eventType);
  assertRequiredTemplateParams(def, input.templateParams);
  if (!input.entityId?.trim()) {
    throw new NotificationRegistryValidationError('entityId', 'entityId is required');
  }
  return input;
}

export function isRegisteredEventType(eventType: string): boolean {
  return resolveNotificationEventType(eventType) != null;
}

export { NotificationEventRegistryError };
