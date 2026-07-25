import { randomUUID } from 'crypto';
import {
  getWorkflowEventDefinition,
  inferEntityFromPayload,
  resolveEventVersion,
  validateWorkflowEventPayload,
  WorkflowDomainEventRegistryError,
  WorkflowDomainEventValidationError,
} from '../registry';
import {
  WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION,
  WORKFLOW_EVENT_MAX_METADATA_BYTES,
  WORKFLOW_EVENT_MAX_PAYLOAD_BYTES,
} from './workflow-domain-event-envelope.constants';
import { normalizeWorkflowEventInput } from './workflow-domain-event-envelope.normalizer';
import { createWorkflowEventRejection } from './workflow-domain-event-envelope.rejection';
import { containsMetadataSecrets } from './workflow-domain-event-envelope.safe-log';
import type {
  WorkflowDomainEventEnvelope,
  WorkflowDomainEventEnvelopeWireInput,
  WorkflowEventEnvelopeResult,
  WorkflowEventEnvelopeValidateOptions,
} from './workflow-domain-event-envelope.types';

const ISO_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(
  reason: Parameters<typeof createWorkflowEventRejection>[0],
  message: string,
  options: Parameters<typeof createWorkflowEventRejection>[2] = {},
): WorkflowEventEnvelopeResult {
  return { ok: false, rejection: createWorkflowEventRejection(reason, message, options) };
}

function assertUtcIso(field: string, value: string | undefined): string | null {
  if (!value?.trim()) return `${field} is required`;
  if (!ISO_UTC_RE.test(value)) {
    return `${field} must be UTC ISO-8601 with Z suffix (got: ${value})`;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return `${field} is not a valid date`;
  return null;
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8');
}

function assertNoCrossTenantLeak(
  organizationId: string,
  payload: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string | null {
  const orgKeys = ['organizationId', 'orgId', 'tenantId', 'organization_id'];
  for (const key of orgKeys) {
    const payloadOrg = payload[key];
    if (typeof payloadOrg === 'string' && payloadOrg.trim() && payloadOrg !== organizationId) {
      return `payload.${key} references organization ${payloadOrg} but envelope organizationId is ${organizationId}`;
    }
    const metaOrg = metadata[key];
    if (typeof metaOrg === 'string' && metaOrg.trim() && metaOrg !== organizationId) {
      return `metadata.${key} references organization ${metaOrg} but envelope organizationId is ${organizationId}`;
    }
  }
  return null;
}

export function freezeEnvelope(
  envelope: WorkflowDomainEventEnvelope,
): WorkflowDomainEventEnvelope {
  return Object.freeze({
    ...envelope,
    payload: Object.freeze({ ...envelope.payload }),
    metadata: Object.freeze({ ...envelope.metadata }),
  });
}

/**
 * Core envelope builder + validator.
 * Returns immutable envelope or structured rejection (dead-letter path).
 */
export function buildWorkflowDomainEventEnvelope(
  input: WorkflowDomainEventEnvelopeWireInput,
  options: WorkflowEventEnvelopeValidateOptions = {},
): WorkflowEventEnvelopeResult {
  const now = options.now ?? new Date();

  if (!input.eventType?.trim()) {
    return fail('MISSING_EVENT_TYPE', 'eventType is required', { field: 'eventType' });
  }

  if (!input.organizationId?.trim()) {
    return fail('MISSING_ORGANIZATION_ID', 'organizationId is required', {
      field: 'organizationId',
      eventType: input.eventType,
    });
  }

  const organizationId = input.organizationId.trim();

  if (options.consumerOrganizationId && options.consumerOrganizationId !== organizationId) {
    return fail(
      'CROSS_TENANT_VIOLATION',
      `Consumer organization ${options.consumerOrganizationId} cannot process event for organization ${organizationId}`,
      {
        field: 'organizationId',
        organizationId,
        eventType: input.eventType,
        deadLetter: true,
      },
    );
  }

  if (!input.source?.trim()) {
    return fail('MISSING_SOURCE', 'source module identifier is required', {
      field: 'source',
      organizationId,
      eventType: input.eventType,
    });
  }

  const schemaVersion = input.schemaVersion ?? WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION;
  if (schemaVersion !== WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION) {
    return fail(
      'INVALID_ENVELOPE_SCHEMA',
      `Unsupported schemaVersion: ${schemaVersion}`,
      { field: 'schemaVersion', organizationId, eventType: input.eventType },
    );
  }

  const eventId = input.eventId?.trim() || randomUUID();

  if (options.eventIdStore) {
    const exists = options.eventIdStore.has(eventId);
    if (exists === true) {
      return fail('DUPLICATE_EVENT_ID', `eventId already registered: ${eventId}`, {
        field: 'eventId',
        eventId,
        organizationId,
        eventType: input.eventType,
      });
    }
  }

  const normalized = normalizeWorkflowEventInput({
    eventType: input.eventType,
    payload: input.payload ?? {},
  });

  const eventType = normalized.eventType;
  const payload = normalized.payload;
  const metadata = input.metadata ?? {};

  if (!getWorkflowEventDefinition(eventType)) {
    return fail(
      'UNKNOWN_EVENT_TYPE',
      `Unregistered workflow event type: ${input.eventType} (resolved: ${eventType})`,
      {
        field: 'eventType',
        organizationId,
        eventType: input.eventType,
        legacySourceKey: normalized.legacySourceKey,
      },
    );
  }

  const crossTenant = assertNoCrossTenantLeak(organizationId, payload, metadata);
  if (crossTenant) {
    return fail('CROSS_TENANT_VIOLATION', crossTenant, {
      field: 'organizationId',
      organizationId,
      eventType,
      eventId,
    });
  }

  let eventVersion: string;
  try {
    eventVersion = resolveEventVersion(eventType, input.eventVersion);
  } catch (err) {
    const message = err instanceof WorkflowDomainEventRegistryError ? err.message : String(err);
    return fail('UNSUPPORTED_EVENT_VERSION', message, {
      field: 'eventVersion',
      organizationId,
      eventType,
    });
  }

  try {
    validateWorkflowEventPayload(eventType, eventVersion, payload);
  } catch (err) {
    const field = err instanceof WorkflowDomainEventValidationError ? err.field : 'payload';
    const message = err instanceof Error ? err.message : String(err);
    return fail('INVALID_PAYLOAD', message, {
      field,
      organizationId,
      eventType,
      eventId,
      legacySourceKey: normalized.legacySourceKey,
    });
  }

  const payloadBytes = jsonByteLength(payload);
  if (payloadBytes > WORKFLOW_EVENT_MAX_PAYLOAD_BYTES) {
    return fail(
      'PAYLOAD_TOO_LARGE',
      `Payload size ${payloadBytes} exceeds limit ${WORKFLOW_EVENT_MAX_PAYLOAD_BYTES}`,
      { field: 'payload', organizationId, eventType, eventId },
    );
  }

  const metadataBytes = jsonByteLength(metadata);
  if (metadataBytes > WORKFLOW_EVENT_MAX_METADATA_BYTES) {
    return fail(
      'METADATA_TOO_LARGE',
      `Metadata size ${metadataBytes} exceeds limit ${WORKFLOW_EVENT_MAX_METADATA_BYTES}`,
      { field: 'metadata', organizationId, eventType, eventId },
    );
  }

  const secretPath = containsMetadataSecrets(metadata);
  if (secretPath) {
    return fail(
      'METADATA_SECRET_VIOLATION',
      `Metadata must not contain secrets (found at ${secretPath})`,
      { field: secretPath, organizationId, eventType, eventId },
    );
  }

  const occurredAt = input.occurredAt ?? now.toISOString();
  const receivedAt = input.receivedAt ?? now.toISOString();

  const occurredErr = assertUtcIso('occurredAt', occurredAt);
  if (occurredErr) {
    return fail('INVALID_TIMESTAMP', occurredErr, {
      field: 'occurredAt',
      organizationId,
      eventType,
      eventId,
    });
  }

  const receivedErr = assertUtcIso('receivedAt', receivedAt);
  if (receivedErr) {
    return fail('INVALID_TIMESTAMP', receivedErr, {
      field: 'receivedAt',
      organizationId,
      eventType,
      eventId,
    });
  }

  if (Date.parse(receivedAt) < Date.parse(occurredAt)) {
    return fail(
      'INVALID_TIMESTAMP',
      'receivedAt must not be before occurredAt',
      { field: 'receivedAt', organizationId, eventType, eventId },
    );
  }

  const def = getWorkflowEventDefinition(eventType)!;
  const inferred = inferEntityFromPayload(def, payload);

  const envelope: WorkflowDomainEventEnvelope = {
    eventId,
    eventType,
    eventVersion,
    organizationId,
    occurredAt,
    receivedAt,
    entityType: input.entityType ?? inferred.entityType ?? null,
    entityId: input.entityId ?? inferred.entityId ?? null,
    correlationId: input.correlationId?.trim() || eventId,
    causationId: input.causationId ?? null,
    source: input.source.trim(),
    payload,
    metadata,
    schemaVersion: WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION,
    ...(normalized.legacySourceKey || input.legacySourceKey
      ? { legacySourceKey: normalized.legacySourceKey ?? input.legacySourceKey }
      : {}),
  };

  if (options.eventIdStore) {
    void options.eventIdStore.register(eventId, organizationId);
  }

  return { ok: true, envelope: freezeEnvelope(envelope) };
}

/** Async variant supporting async eventIdStore.has(). */
export async function buildWorkflowDomainEventEnvelopeAsync(
  input: WorkflowDomainEventEnvelopeWireInput,
  options: WorkflowEventEnvelopeValidateOptions = {},
): Promise<WorkflowEventEnvelopeResult> {
  const eventId = input.eventId?.trim();
  if (options.eventIdStore && eventId) {
    const exists = await options.eventIdStore.has(eventId);
    if (exists) {
      return fail('DUPLICATE_EVENT_ID', `eventId already registered: ${eventId}`, {
        field: 'eventId',
        eventId,
        organizationId: input.organizationId,
        eventType: input.eventType,
      });
    }
  }
  return buildWorkflowDomainEventEnvelope(input, options);
}
