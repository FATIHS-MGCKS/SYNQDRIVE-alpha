import type { WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION } from './workflow-domain-event-envelope.constants';

/**
 * Immutable, queue- and database-serializable workflow domain event envelope.
 * All timestamps are UTC ISO-8601 strings on the wire.
 */
export interface WorkflowDomainEventEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  readonly organizationId: string;
  /** When the business fact occurred (UTC ISO-8601). */
  readonly occurredAt: string;
  /** When SynqDrive received/ingested the event (UTC ISO-8601). */
  readonly receivedAt: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  /** Links events belonging to the same business process. */
  readonly correlationId: string;
  /** eventId of the upstream event that caused this one, if any. */
  readonly causationId: string | null;
  /** Producing module identifier, e.g. `bookings`, `vehicle-health`. */
  readonly source: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly schemaVersion: typeof WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION;
  /** Set when inbound type was adapted from a legacy key. */
  readonly legacySourceKey?: string;
}

export type WorkflowDomainEventEnvelopeSchemaVersion =
  typeof WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION;

/** Input for factory — producers supply business data; envelope fills system fields. */
export interface CreateWorkflowDomainEventEnvelopeInput {
  organizationId: string;
  eventType: string;
  source: string;
  payload?: Record<string, unknown>;
  eventVersion?: string;
  occurredAt?: Date | string;
  receivedAt?: Date | string;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  metadata?: Record<string, unknown>;
  /** Supply only for idempotent replay; otherwise auto-generated UUID. */
  eventId?: string;
}

/** Partial wire input (e.g. queue consumer) before validation. */
export interface WorkflowDomainEventEnvelopeWireInput {
  eventId?: string;
  eventType: string;
  eventVersion?: string;
  organizationId?: string;
  occurredAt?: string;
  receivedAt?: string;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  source?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  schemaVersion?: string;
  legacySourceKey?: string;
}

export type WorkflowEventRejectionReason =
  | 'MISSING_ORGANIZATION_ID'
  | 'UNKNOWN_EVENT_TYPE'
  | 'UNSUPPORTED_EVENT_VERSION'
  | 'INVALID_PAYLOAD'
  | 'INVALID_TIMESTAMP'
  | 'CROSS_TENANT_VIOLATION'
  | 'DUPLICATE_EVENT_ID'
  | 'METADATA_SECRET_VIOLATION'
  | 'PAYLOAD_TOO_LARGE'
  | 'METADATA_TOO_LARGE'
  | 'INVALID_ENVELOPE_SCHEMA'
  | 'MISSING_SOURCE'
  | 'MISSING_EVENT_TYPE';

/** Structured rejection for dead-letter / observability — never silent drop. */
export interface WorkflowEventRejection {
  readonly reason: WorkflowEventRejectionReason;
  readonly field?: string;
  readonly message: string;
  readonly rejectedAt: string;
  readonly deadLetter: boolean;
  readonly organizationId?: string;
  readonly eventType?: string;
  readonly eventId?: string;
  readonly legacySourceKey?: string;
}

export type WorkflowEventEnvelopeResult =
  | { readonly ok: true; readonly envelope: WorkflowDomainEventEnvelope }
  | { readonly ok: false; readonly rejection: WorkflowEventRejection };

/** Optional deduplication store for globally unique eventId enforcement. */
export interface WorkflowEventIdStore {
  has(eventId: string): boolean | Promise<boolean>;
  register(eventId: string, organizationId: string): void | Promise<void>;
}

export interface WorkflowEventEnvelopeValidateOptions {
  eventIdStore?: WorkflowEventIdStore;
  /** When processing, assert envelope org matches consumer tenant. */
  consumerOrganizationId?: string;
  now?: Date;
}

/**
 * PII classification for logging documentation.
 * - `none` — IDs and codes only
 * - `indirect` — opaque refs (recipientRef)
 * - `direct` — never allowed in workflow event payloads
 */
export type WorkflowEventPiiClass = 'none' | 'indirect' | 'direct';
