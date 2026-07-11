import { buildNotificationFingerprint } from '../notification-fingerprint.factory';
import type { NotificationCandidate } from '../notification.types';
import {
  NOTIFICATION_EVENT_SLUG_ALIASES,
  NOTIFICATION_EVENT_TYPE_DEFINITIONS,
} from './notification-event-registry.definitions';
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

function bootstrapRegistry(
  definitions: readonly NotificationEventTypeDefinition[],
): Map<string, NotificationEventTypeDefinition> {
  const byEventType = new Map<string, NotificationEventTypeDefinition>();
  const bySlug = new Map<string, string>();

  for (const def of definitions) {
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

export function getEventTypeDefinition(
  eventType: string,
): NotificationEventTypeDefinition | undefined {
  return REGISTRY_MAP.get(eventType);
}

export function requireEventTypeDefinition(eventType: string): NotificationEventTypeDefinition {
  const def = getEventTypeDefinition(eventType);
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
  const def = requireEventTypeDefinition(input.eventType);
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

  return {
    organizationId: input.organizationId,
    eventType: def.eventType,
    eventKind: def.eventKind,
    domain: def.domain,
    severity: input.severity ?? def.defaultSeverity,
    entityType,
    entityId: input.entityId,
    conditionCode,
    scopeVersion: def.fingerprintVersion,
    sourceType: input.sourceType ?? def.sourceType,
    sourceRef: input.sourceRef,
    occurredAt: input.occurredAt,
    titleKey: def.titleKey,
    bodyKey: def.bodyKey,
    templateParams: input.templateParams,
    actionType: def.actionType,
    actionTarget,
    resolutionPolicy: def.resolutionPolicy,
    deliveryPolicy: def.deliveryPolicy,
    expiresAt: input.expiresAt,
    metadata: input.metadata,
  };
}
