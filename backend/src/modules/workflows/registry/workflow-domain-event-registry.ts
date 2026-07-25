import {
  WORKFLOW_DOMAIN_EVENT_DEFINITIONS,
  WORKFLOW_DOMAIN_EVENT_TYPES,
} from './workflow-domain-event-registry.definitions';
import {
  WORKFLOW_LEGACY_EVENT_ADAPTER_MAP,
  WORKFLOW_LEGACY_EVENT_ADAPTERS,
} from './workflow-domain-event-registry.legacy';
import type {
  WorkflowDomainEventDefinition,
  WorkflowLegacyEventAdapter,
  WorkflowRegistryDomainEvent,
} from './workflow-domain-event-registry.types';

export class WorkflowDomainEventRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowDomainEventRegistryError';
  }
}

function bootstrapRegistry(
  definitions: readonly WorkflowDomainEventDefinition[],
): Map<string, WorkflowDomainEventDefinition> {
  const byEventType = new Map<string, WorkflowDomainEventDefinition>();

  for (const def of definitions) {
    if (byEventType.has(def.eventType)) {
      throw new WorkflowDomainEventRegistryError(
        `Duplicate workflow eventType registration: ${def.eventType}`,
      );
    }
    byEventType.set(def.eventType, def);
  }

  return byEventType;
}

const REGISTRY_MAP = bootstrapRegistry(WORKFLOW_DOMAIN_EVENT_DEFINITIONS);

export const WORKFLOW_DOMAIN_EVENT_REGISTRY: readonly WorkflowDomainEventDefinition[] = Object.freeze(
  [...REGISTRY_MAP.values()],
);

export function getWorkflowEventDefinition(
  eventType: string,
): WorkflowDomainEventDefinition | undefined {
  return REGISTRY_MAP.get(eventType);
}

export function requireWorkflowEventDefinition(eventType: string): WorkflowDomainEventDefinition {
  const def = getWorkflowEventDefinition(eventType);
  if (!def) {
    throw new WorkflowDomainEventRegistryError(`Unregistered workflow eventType: ${eventType}`);
  }
  return def;
}

export function isRegisteredWorkflowEventType(eventType: string): boolean {
  return REGISTRY_MAP.has(eventType);
}

export function listWorkflowEventTypes(): readonly string[] {
  return WORKFLOW_DOMAIN_EVENT_TYPES;
}

export function listWorkflowEventsByDomain(
  domain: WorkflowDomainEventDefinition['domain'],
): WorkflowDomainEventDefinition[] {
  return WORKFLOW_DOMAIN_EVENT_REGISTRY.filter((d) => d.domain === domain);
}

export function getLegacyEventAdapter(legacyKey: string): WorkflowLegacyEventAdapter | undefined {
  return WORKFLOW_LEGACY_EVENT_ADAPTER_MAP[legacyKey];
}

export function listLegacyEventAdapters(): readonly WorkflowLegacyEventAdapter[] {
  return WORKFLOW_LEGACY_EVENT_ADAPTERS;
}

/**
 * Resolve raw trigger/event type to canonical registry event type.
 * Applies explicit legacy adapters only — unknown keys pass through unchanged.
 */
export function resolveCanonicalEventType(rawType: string): string {
  const trimmed = rawType?.trim();
  if (!trimmed) return trimmed;
  if (REGISTRY_MAP.has(trimmed)) return trimmed;
  const adapter = WORKFLOW_LEGACY_EVENT_ADAPTER_MAP[trimmed];
  return adapter?.canonicalEventType ?? trimmed;
}

/**
 * Normalize a raw inbound event through legacy adapters (payload + type).
 */
export function adaptLegacyWorkflowEvent(input: {
  type: string;
  payload?: Record<string, unknown>;
}): { type: string; payload: Record<string, unknown>; legacySourceKey?: string } {
  const trimmed = input.type?.trim();
  const adapter = WORKFLOW_LEGACY_EVENT_ADAPTER_MAP[trimmed];
  if (!adapter) {
    return { type: trimmed, payload: input.payload ?? {} };
  }
  const payload = adapter.adapt ? adapter.adapt(input.payload ?? {}) : (input.payload ?? {});
  return {
    type: adapter.canonicalEventType,
    payload,
    legacySourceKey: adapter.legacyKey,
  };
}

export function getSupportedEventVersions(eventType: string): string[] {
  const def = getWorkflowEventDefinition(eventType);
  if (!def) return [];
  return Object.keys(def.versions);
}

export function resolveEventVersion(eventType: string, requested?: string): string {
  const def = requireWorkflowEventDefinition(eventType);
  const version = requested?.trim() || def.defaultVersion;
  if (!def.versions[version]) {
    throw new WorkflowDomainEventRegistryError(
      `Unsupported eventVersion "${version}" for ${eventType}. ` +
        `Supported: ${Object.keys(def.versions).join(', ')}`,
    );
  }
  return version;
}

export function inferEntityFromPayload(
  def: WorkflowDomainEventDefinition,
  payload: Record<string, unknown>,
): { entityType?: string; entityId?: string } {
  const primaryField = `${def.primaryEntityType}Id`;
  if (payload[primaryField] && typeof payload[primaryField] === 'string') {
    return { entityType: def.primaryEntityType, entityId: payload[primaryField] as string };
  }
  if (def.primaryEntityType === 'organization') {
    return { entityType: 'organization' };
  }
  for (const field of def.relatedEntityFields ?? []) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) {
      const entityType = field.replace(/Id$/, '');
      return { entityType, entityId: value };
    }
  }
  return {};
}

export function toRegistryDomainEvent(
  input: WorkflowRegistryDomainEvent,
): WorkflowRegistryDomainEvent {
  return {
    ...input,
    type: resolveCanonicalEventType(input.type),
    occurredAt: input.occurredAt ?? new Date(),
    payload: input.payload ?? {},
  };
}

export {
  WORKFLOW_DOMAIN_EVENT_DEFINITIONS,
  WORKFLOW_DOMAIN_EVENT_TYPES,
  WORKFLOW_LEGACY_EVENT_ADAPTERS,
  WORKFLOW_LEGACY_EVENT_ADAPTER_MAP,
};
