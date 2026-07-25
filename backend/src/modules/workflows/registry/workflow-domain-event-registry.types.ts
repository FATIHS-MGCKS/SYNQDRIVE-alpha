/**
 * SynqDrive workflow domain event registry — shared types.
 * Events (past tense, occurred) are distinct from commands (imperative).
 */

/** Business domain grouping for documentation and producer ownership. */
export type WorkflowEventDomain =
  | 'booking'
  | 'vehicle'
  | 'invoice'
  | 'payment'
  | 'customer'
  | 'damage'
  | 'service'
  | 'task'
  | 'support'
  | 'notification'
  | 'connectivity'
  | 'manual';

/** Occurred = discrete past-tense fact; state = ongoing condition signal. */
export type WorkflowEventKind = 'occurred' | 'state';

export type WorkflowPayloadFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'iso-date';

export interface WorkflowPayloadFieldSchema {
  type: WorkflowPayloadFieldType;
  /** Human-readable description for docs generation. */
  description?: string;
  enum?: readonly string[];
}

/**
 * Minimal JSON-schema-like contract — validated in-process without external deps.
 * Payloads must contain entity references (IDs) only; no free-text PII.
 */
export interface WorkflowEventPayloadSchema {
  /** Required top-level payload keys (IDs, codes, timestamps). */
  required: readonly string[];
  /** Optional keys allowed when present. */
  optional?: readonly string[];
  /** Field type constraints when key is present. */
  fields?: Readonly<Record<string, WorkflowPayloadFieldSchema>>;
  /**
   * Keys that must never appear in workflow event payloads
   * (PII / secrets — use entity IDs and resolve in actions).
   */
  forbidden?: readonly string[];
}

/** Semantic version entry for a single event type. */
export interface WorkflowDomainEventVersionDefinition {
  eventVersion: string;
  payloadSchema: WorkflowEventPayloadSchema;
  /** ISO date when this version was introduced. */
  introducedAt: string;
  deprecatedAt?: string;
  changelog?: string;
}

/** Canonical registry entry — one row per `eventType`. */
export interface WorkflowDomainEventDefinition {
  /** Dot-namespaced past-tense identifier, e.g. `booking.returned`. */
  eventType: string;
  domain: WorkflowEventDomain;
  kind: WorkflowEventKind;
  description: string;
  /** Default semantic version for producers that omit `eventVersion`. */
  defaultVersion: string;
  versions: Readonly<Record<string, WorkflowDomainEventVersionDefinition>>;
  /** Owning SynqDrive module (producer responsibility). */
  producerModule: string;
  /** Primary entity type for scope matching (`booking`, `vehicle`, …). */
  primaryEntityType: string;
  /** Additional entity id fields expected in payload for navigation/scope. */
  relatedEntityFields?: readonly string[];
}

/**
 * Explicit legacy adapter — never silent remapping.
 * `adapt()` may enrich payload when migrating semantic mismatches.
 */
export interface WorkflowLegacyEventAdapter {
  legacyKey: string;
  canonicalEventType: string;
  /** Why this legacy key existed and how to migrate producers. */
  migrationNotes: string;
  deprecated: boolean;
  /**
   * When set, documents a previously wrong mapping that was removed.
   * e.g. `fine_created` must not map to `customer.complaint.created`.
   */
  replacedWrongMapping?: string;
  adapt?: (payload: Record<string, unknown>) => Record<string, unknown>;
}

/** Envelope passed to workflow engine after registry normalization. */
export interface WorkflowRegistryDomainEvent {
  organizationId: string;
  type: string;
  eventVersion: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  idempotencyKey?: string;
  /** Set when event arrived via legacy adapter. */
  legacySourceKey?: string;
}

export interface WorkflowRegistryValidateInput {
  organizationId: string;
  type: string;
  eventVersion?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  idempotencyKey?: string;
}
