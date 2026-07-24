/**
 * Canonical enums for AI Evidence — shared contract for all domain facts
 * passed to the Fleet AI Assistant (tools, audit, LLM serialization).
 *
 * Aligns with baseline audit `ai-agent-domain-grounding-baseline-2026-07.md`.
 */

/** Telemetry-aligned freshness for observed facts; `not_applicable` for static/knowledge. */
export const AI_EVIDENCE_FRESHNESS = [
  'live',
  'standby',
  'signal_delayed',
  'offline',
  'no_signal',
  'not_applicable',
] as const;

export type AiEvidenceFreshness = (typeof AI_EVIDENCE_FRESHNESS)[number];

/** Domain service or knowledge origin — never free-form strings. */
export const AI_EVIDENCE_SOURCES = [
  'vehicle_latest_state',
  'vehicles_service',
  'dimo_telemetry',
  'dimo_segments',
  'rental_health_service',
  'bookings_service',
  'bookings_handover_service',
  'invoice_service',
  'customer_service',
  'connectivity_runtime',
  'task_service',
  'knowledge_base',
  'static_config',
  'manual_entry',
  'document_extraction',
  'calculated_derivation',
] as const;

export type AiEvidenceSource = (typeof AI_EVIDENCE_SOURCES)[number];

/** Whether the fact can be used for grounded answers. */
export const AI_EVIDENCE_AVAILABILITY = [
  'available',
  'partial',
  'unavailable',
  'permission_denied',
] as const;

export type AiEvidenceAvailability = (typeof AI_EVIDENCE_AVAILABILITY)[number];

/** Epistemic confidence in the value — distinct from freshness. */
export const AI_EVIDENCE_CONFIDENCE = [
  'high',
  'medium',
  'low',
  'unknown',
] as const;

export type AiEvidenceConfidence = (typeof AI_EVIDENCE_CONFIDENCE)[number];

/** Data classification for LLM redaction and role-based filtering. */
export const AI_EVIDENCE_SENSITIVITY = [
  'public',
  'internal',
  'pii',
  'restricted',
] as const;

export type AiEvidenceSensitivity = (typeof AI_EVIDENCE_SENSITIVITY)[number];

/** How the fact was produced — drives timestamp requirements. */
export const AI_EVIDENCE_FACT_KINDS = [
  'observed',
  'calculated',
  'static',
] as const;

export type AiEvidenceFactKind = (typeof AI_EVIDENCE_FACT_KINDS)[number];

/** Entity type referenced by {@link AiEvidenceSourceEntity}. */
export const AI_EVIDENCE_SOURCE_ENTITY_KINDS = [
  'vehicle',
  'booking',
  'customer',
  'organization',
  'trip',
  'invoice',
  'task',
  'health_module',
  'document',
  'user',
  'fleet',
  'other',
] as const;

export type AiEvidenceSourceEntityKind =
  (typeof AI_EVIDENCE_SOURCE_ENTITY_KINDS)[number];

/** Structured outcome / validation codes for evidence records. */
export const AI_EVIDENCE_REASON_CODES = [
  'ok',
  'data_unavailable',
  'permission_denied',
  'stale_data',
  'partial_data',
  'entity_not_found',
  'timestamp_inconsistent',
  'pipeline_failure',
  'sensitivity_redacted',
  'invalid_tenant',
  'validation_failed',
  'signal_not_supported',
  'provider_outage',
] as const;

export type AiEvidenceReasonCode = (typeof AI_EVIDENCE_REASON_CODES)[number];
