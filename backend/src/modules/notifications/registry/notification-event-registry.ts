import { buildNotificationFingerprint } from '../notification-fingerprint.factory';
import type { NotificationCandidate } from '../notification.types';
import {
  deriveRecoveryState,
  NOTIFICATION_CANDIDATE_SCHEMA_VERSION,
} from '../notification-candidate.contract';
import {
  NOTIFICATION_EVENT_SLUG_ALIASES,
  NOTIFICATION_EVENT_TYPE_DEFINITIONS,
} from './notification-event-registry.definitions';
import { NOTIFICATION_EVENT_TYPE_ALIASES } from './notification-event-registry.aliases';
import { deriveRetentionClass } from './notification-event-registry.consistency';
import type {
  NotificationActionTargetContext,
  NotificationEventTypeDefinition,
  RegistryCandidateBuildInput,
} from './notification-event-registry.types';

export class NotificationEventRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationEventRegistryError';
  }
}

function withRetentionClass(
  def: NotificationEventTypeDefinition,
): NotificationEventTypeDefinition {
  return {
    ...def,
    retentionClass: def.retentionClass ?? deriveRetentionClass(def),
  };
}

function bootstrapRegistry(
  definitions: readonly NotificationEventTypeDefinition[],
): Map<string, NotificationEventTypeDefinition> {
  const byEventType = new Map<string, NotificationEventTypeDefinition>();
  const bySlug = new Map<string, string>();

  for (const raw of definitions) {
    const def = withRetentionClass(raw);
    if (byEventType.has(def.eventType)) {
      throw new NotificationEventRegistryError(
        `Duplicate notification eventType registration: ${def.eventType}`,
      );
    }
    if (bySlug.has(def.slug)) {
      throw new NotificationEventRegistryError(
        `Duplicate notification slug registration: ${def.slug}`,
      );
    }
    byEventType.set(def.eventType, def);
    bySlug.set(def.slug, def.eventType);
  }

  for (const [alias, canonicalSlug] of Object.entries(NOTIFICATION_EVENT_SLUG_ALIASES)) {
    if (!bySlug.has(canonicalSlug)) {
      throw new NotificationEventRegistryError(
        `Alias ${alias} points to unknown slug ${canonicalSlug}`,
      );
    }
  }

  return byEventType;
}

const REGISTRY_MAP = bootstrapRegistry(NOTIFICATION_EVENT_TYPE_DEFINITIONS);

export const NOTIFICATION_EVENT_REGISTRY: readonly NotificationEventTypeDefinition[] =
  Object.freeze([...REGISTRY_MAP.values()]);

export function resolveEventSlug(slug: string): string {
  const canonical = NOTIFICATION_EVENT_SLUG_ALIASES[slug] ?? slug;
  const def = NOTIFICATION_EVENT_TYPE_DEFINITIONS.find((d) => d.slug === canonical);
  if (!def) {
    throw new NotificationEventRegistryError(`Unknown notification event slug: ${slug}`);
  }
  return def.eventType;
}

export function resolveNotificationEventType(eventType: string): string | undefined {
  const trimmed = eventType?.trim();
  if (!trimmed) return undefined;
  const canonical = NOTIFICATION_EVENT_TYPE_ALIASES[trimmed] ?? trimmed;
  return REGISTRY_MAP.has(canonical) ? canonical : undefined;
}

export function getEventTypeDefinition(
  eventType: string,
): NotificationEventTypeDefinition | undefined {
  const canonical = resolveNotificationEventType(eventType);
  return canonical ? REGISTRY_MAP.get(canonical) : undefined;
}

export function requireEventTypeDefinition(eventType: string): NotificationEventTypeDefinition {
  const canonical = resolveNotificationEventType(eventType);
  if (!canonical) {
    throw new NotificationEventRegistryError(`Unregistered notification eventType: ${eventType}`);
  }
  const def = REGISTRY_MAP.get(canonical);
  if (!def) {
    throw new NotificationEventRegistryError(`Unregistered notification eventType: ${eventType}`);
  }
  return def;
}

export function listShadowModeEventTypes(): string[] {
  return NOTIFICATION_EVENT_REGISTRY.filter((d) => d.shadowModeEnabled).map((d) => d.eventType);
}

export function buildRegistryFingerprint(
  organizationId: string,
  eventType: string,
  entityId: string,
  entityType?: NotificationEventTypeDefinition['defaultEntityType'],
) {
  const def = requireEventTypeDefinition(eventType);
  return buildNotificationFingerprint({
    organizationId,
    eventType: def.eventType,
    entityType: entityType ?? def.defaultEntityType,
    entityId,
    conditionCode: def.conditionCode,
    scopeVersion: def.fingerprintVersion,
  });
}

export function buildCandidateFromRegistry(
  input: RegistryCandidateBuildInput,
): NotificationCandidate {
  const canonicalEventType = resolveNotificationEventType(input.eventType);
  if (!canonicalEventType) {
    throw new NotificationEventRegistryError(`Unregistered notification eventType: ${input.eventType}`);
  }
  const def = requireEventTypeDefinition(canonicalEventType);
  const entityType = input.entityType ?? def.defaultEntityType;
  const actionCtx: NotificationActionTargetContext = {
    entityType,
    entityId: input.entityId,
    ...input.actionTargetContext,
  };
  const actionTarget = def.actionTargetBuilder(actionCtx);

  const conditionCode = input.conditionCodeVariant?.trim()
    ? `${def.conditionCode}:${input.conditionCodeVariant.trim()}`
    : def.conditionCode;

  const sourceSystem = input.sourceSystem ?? input.sourceType ?? def.sourceType;
  const sourceEventId = input.sourceEventId ?? input.sourceRef;
  const entityRefs = {
    vehicleId: actionCtx.vehicleId,
    bookingId: actionCtx.bookingId,
    stationId: actionCtx.stationId,
    customerId: actionCtx.customerId,
    userId: input.userId,
  };
  const severity = input.severity ?? def.defaultSeverity;

  return {
    schemaVersion: input.schemaVersion ?? NOTIFICATION_CANDIDATE_SCHEMA_VERSION,
    organizationId: input.organizationId,
    eventType: def.eventType,
    eventKind: def.eventKind,
    domain: def.domain,
    severity,
    recoveryState: deriveRecoveryState(severity),
    entityType,
    entityId: input.entityId,
    conditionKey: conditionCode,
    conditionCode,
    scopeVersion: def.fingerprintVersion,
    sourceSystem,
    sourceType: sourceSystem,
    sourceEventId,
    sourceRef: sourceEventId,
    occurredAt: input.occurredAt,
    observedAt: input.observedAt ?? input.occurredAt,
    templateKey: def.titleKey,
    titleKey: def.titleKey,
    bodyKey: def.bodyKey,
    templateParams: input.templateParams,
    actionType: def.actionType,
    actionTarget,
    resolutionPolicy: def.resolutionPolicy,
    deliveryPolicy: def.deliveryPolicy,
    expiresAt: input.expiresAt,
    correlationId: input.correlationId,
    causationId: input.causationId,
    metadata: input.metadata,
    ...entityRefs,
  };
}
