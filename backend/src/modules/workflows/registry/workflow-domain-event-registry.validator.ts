import {
  getWorkflowEventDefinition,
  requireWorkflowEventDefinition,
  resolveCanonicalEventType,
  resolveEventVersion,
  adaptLegacyWorkflowEvent,
  inferEntityFromPayload,
  WorkflowDomainEventRegistryError,
} from './workflow-domain-event-registry';
import type {
  WorkflowEventPayloadSchema,
  WorkflowPayloadFieldSchema,
  WorkflowRegistryDomainEvent,
  WorkflowRegistryValidateInput,
} from './workflow-domain-event-registry.types';

export class WorkflowDomainEventValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowDomainEventValidationError';
  }
}

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoDateValue(value: unknown): boolean {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) return true;
  return false;
}

function assertFieldType(
  eventType: string,
  key: string,
  value: unknown,
  schema: WorkflowPayloadFieldSchema,
): void {
  if (value === undefined || value === null) return;

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string' || !value.trim()) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected non-empty string for ${eventType}.${key}`,
        );
      }
      if (schema.enum && !schema.enum.includes(value)) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Invalid enum value for ${eventType}.${key}: ${value}`,
        );
      }
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected number for ${eventType}.${key}`,
        );
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected boolean for ${eventType}.${key}`,
        );
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected object for ${eventType}.${key}`,
        );
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected array for ${eventType}.${key}`,
        );
      }
      break;
    case 'iso-date':
      if (!isIsoDateValue(value)) {
        throw new WorkflowDomainEventValidationError(
          `payload.${key}`,
          `Expected ISO-8601 date for ${eventType}.${key}`,
        );
      }
      break;
    default:
      break;
  }
}

function assertForbiddenPii(
  eventType: string,
  payload: Record<string, unknown>,
  schema: WorkflowEventPayloadSchema,
): void {
  const forbidden = schema.forbidden ?? [];
  for (const key of forbidden) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      throw new WorkflowDomainEventValidationError(
        `payload.${key}`,
        `Forbidden PII/secret field "${key}" in workflow event ${eventType}`,
      );
    }
  }
}

function assertAllowedKeys(
  eventType: string,
  payload: Record<string, unknown>,
  schema: WorkflowEventPayloadSchema,
): void {
  const allowed = new Set([
    ...schema.required,
    ...(schema.optional ?? []),
    ...Object.keys(schema.fields ?? {}),
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new WorkflowDomainEventValidationError(
        `payload.${key}`,
        `Unexpected payload key "${key}" for workflow event ${eventType}`,
      );
    }
  }
}

export function validateWorkflowEventPayload(
  eventType: string,
  eventVersion: string,
  payload: Record<string, unknown>,
): void {
  const def = requireWorkflowEventDefinition(eventType);
  const versionDef = def.versions[eventVersion];
  if (!versionDef) {
    throw new WorkflowDomainEventRegistryError(
      `Unsupported eventVersion "${eventVersion}" for ${eventType}`,
    );
  }

  const schema = versionDef.payloadSchema;

  for (const key of schema.required) {
    const value = payload[key];
    if (value === undefined || value === null || value === '') {
      throw new WorkflowDomainEventValidationError(
        `payload.${key}`,
        `Missing required field "${key}" for ${eventType}@${eventVersion}`,
      );
    }
  }

  assertForbiddenPii(eventType, payload, schema);
  assertAllowedKeys(eventType, payload, schema);

  if (schema.fields) {
    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      assertFieldType(eventType, key, payload[key], fieldSchema);
    }
  }
}

/**
 * Normalize + validate inbound workflow domain event.
 * Rejects unknown event types, unknown versions, and invalid payloads.
 */
export function validateAndNormalizeWorkflowEvent(
  input: WorkflowRegistryValidateInput,
): WorkflowRegistryDomainEvent {
  if (!input.organizationId?.trim()) {
    throw new WorkflowDomainEventValidationError('organizationId', 'organizationId is required');
  }
  if (!input.type?.trim()) {
    throw new WorkflowDomainEventValidationError('type', 'event type is required');
  }

  const adapted = adaptLegacyWorkflowEvent({
    type: input.type,
    payload: input.payload ?? {},
  });
  const canonicalType = resolveCanonicalEventType(adapted.type);

  if (!getWorkflowEventDefinition(canonicalType)) {
    throw new WorkflowDomainEventValidationError(
      'type',
      `Unregistered workflow event type: ${input.type} (resolved: ${canonicalType})`,
    );
  }

  const eventVersion = resolveEventVersion(canonicalType, input.eventVersion);
  validateWorkflowEventPayload(canonicalType, eventVersion, adapted.payload);

  const def = requireWorkflowEventDefinition(canonicalType);
  const inferred = inferEntityFromPayload(def, adapted.payload);

  return {
    organizationId: input.organizationId.trim(),
    type: canonicalType,
    eventVersion,
    entityType: input.entityType ?? inferred.entityType,
    entityId: input.entityId ?? inferred.entityId,
    payload: adapted.payload,
    occurredAt: input.occurredAt ?? new Date(),
    idempotencyKey: input.idempotencyKey,
    legacySourceKey: adapted.legacySourceKey,
  };
}

export function isValidWorkflowEventType(rawType: string): boolean {
  const canonical = resolveCanonicalEventType(rawType);
  return getWorkflowEventDefinition(canonical) != null;
}

export { WorkflowDomainEventRegistryError };
