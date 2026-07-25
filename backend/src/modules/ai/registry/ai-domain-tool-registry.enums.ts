/** Cache policy for registered AI domain tools. */
export const AI_DOMAIN_TOOL_CACHE_POLICIES = [
  /** Never cache — live telemetry and booking state. */
  'no_cache',
  /** Short TTL within a single assistant request (e.g. health aggregates). */
  'request_short_ttl',
] as const;

export type AiDomainToolCachePolicy =
  (typeof AI_DOMAIN_TOOL_CACHE_POLICIES)[number];

/** Audit verbosity for registry tool invocations. */
export const AI_DOMAIN_TOOL_AUDIT_LEVELS = [
  /** Input/output summary only — no raw payloads. */
  'standard',
  /** Elevated — includes structured outcome metadata. */
  'elevated',
  /** Minimal — deny events only. */
  'minimal',
] as const;

export type AiDomainToolAuditLevel = (typeof AI_DOMAIN_TOOL_AUDIT_LEVELS)[number];

/** Whether tool output may contain regulated personal data. */
export const AI_DOMAIN_TOOL_PERSONAL_DATA = [
  'none',
  /** May include customer display name when `customers.read` permits. */
  'conditional_customer',
  /** GPS coordinates — location tool. */
  'location_coordinates',
] as const;

export type AiDomainToolPersonalData =
  (typeof AI_DOMAIN_TOOL_PERSONAL_DATA)[number];

/**
 * Stable audit event names for registry preflight and execution.
 * Distinct from per-error `AI_DOMAIN_AUDIT_EVENTS` on {@link AiDomainError}.
 */
export const AI_DOMAIN_TOOL_REGISTRY_AUDIT_EVENTS = [
  'ai.domain_tool.preflight_denied',
  'ai.domain_tool.executed',
  'ai.domain_tool.timeout',
  'ai.domain_tool.unknown_tool',
  'ai.domain_tool.channel_denied',
  'ai.domain_tool.invocation_limit',
] as const;

export type AiDomainToolRegistryAuditEvent =
  (typeof AI_DOMAIN_TOOL_REGISTRY_AUDIT_EVENTS)[number];
