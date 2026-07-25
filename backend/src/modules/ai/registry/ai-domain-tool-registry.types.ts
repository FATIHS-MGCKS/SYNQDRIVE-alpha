import type { MembershipRole } from '@prisma/client';
import type { AiDomainErrorRetryPolicy } from '../evidence/ai-domain-error.enums';
import type { AiEvidenceSensitivity } from '../evidence/ai-evidence.enums';
import type {
  AiDataAccessPurpose,
  AiExecutionChannel,
} from '../execution/ai-execution-context.enums';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import type {
  AiDomainToolAuditLevel,
  AiDomainToolCachePolicy,
  AiDomainToolPersonalData,
  AiDomainToolRegistryAuditEvent,
} from './ai-domain-tool-registry.enums';

/** Closed union of all registered SynqDrive AI domain tool names. */
export const AI_DOMAIN_TOOL_NAMES = [
  'get_vehicle_location',
  'get_vehicle_telemetry_status',
  'get_vehicle_health_summary',
  'explain_overdue_return',
  'get_vehicle_booking_context',
] as const;

export type AiDomainToolName = (typeof AI_DOMAIN_TOOL_NAMES)[number];

export type AiDomainToolSchemaFieldType = 'string' | 'boolean' | 'number' | 'object';

export interface AiDomainToolSchemaField {
  readonly name: string;
  readonly type: AiDomainToolSchemaFieldType;
  readonly required: boolean;
  readonly format?: 'uuid';
  readonly description: string;
}

export interface AiDomainToolInputSchema {
  readonly type: 'object';
  readonly additionalProperties: false;
  readonly fields: readonly AiDomainToolSchemaField[];
}

export interface AiDomainToolOutputSchema {
  readonly type: 'object';
  readonly description: string;
  readonly fields: readonly AiDomainToolSchemaField[];
}

export interface AiDomainToolPermissionRequirement {
  readonly module: string;
  readonly action: 'read' | 'write';
  readonly description: string;
}

export interface AiDomainToolCacheRule {
  readonly policy: AiDomainToolCachePolicy;
  /** TTL in ms when policy is `request_short_ttl`; otherwise `null`. */
  readonly ttlMs: number | null;
  readonly scope: 'none' | 'vehicle' | 'organization';
  readonly description: string;
}

/**
 * Static, typed metadata for a registered AI domain tool.
 * Version field enables future orchestrator migrations without stringly tool names.
 * at runtime.
 */
export interface AiDomainToolDefinition {
  readonly name: AiDomainToolName;
  readonly version: string;
  readonly description: string;
  readonly descriptionDe: string;
  readonly inputSchema: AiDomainToolInputSchema;
  readonly outputSchema: AiDomainToolOutputSchema;
  /** Membership roles allowed to invoke (MASTER_ADMIN always permitted). */
  readonly allowedRoles: readonly (MembershipRole | 'MASTER_ADMIN')[];
  readonly requiredPermissions: readonly AiDomainToolPermissionRequirement[];
  /** Maximum data sensitivity produced by the tool. */
  readonly dataClassification: AiEvidenceSensitivity;
  readonly timeoutMs: number;
  readonly retryBehavior: AiDomainErrorRetryPolicy;
  readonly auditLevel: AiDomainToolAuditLevel;
  readonly allowedChannels: readonly AiExecutionChannel[];
  readonly cacheRule: AiDomainToolCacheRule;
  readonly personalData: AiDomainToolPersonalData;
  /** Maximum invocations of this tool per assistant request / correlation. */
  readonly maxInvocationsPerRequest: number;
  /** When true, registry preflight requires elevated permission before execution. */
  readonly requiresSensitiveDataPermission: boolean;
}

export interface AiDomainToolInvocationTracker {
  readonly counts: Map<AiDomainToolName, number>;
}

export function createAiDomainToolInvocationTracker(): AiDomainToolInvocationTracker {
  return { counts: new Map() };
}

export interface AiDomainToolExecuteOptions {
  readonly nowMs?: number;
  readonly invocationTracker?: AiDomainToolInvocationTracker;
  /** Test / orchestrator hook — overrides registered definition timeout. */
  readonly timeoutOverrideMs?: number;
}

export interface AiDomainToolRegistryAuditPayload {
  readonly event: AiDomainToolRegistryAuditEvent;
  readonly toolName: AiDomainToolName;
  readonly toolVersion: string;
  readonly decision: 'allow' | 'deny';
  readonly organizationId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly channel: AiExecutionChannel;
  readonly dataAccessPurpose: AiDataAccessPurpose;
  readonly partial?: boolean;
  readonly durationMs?: number;
  readonly code?: string;
  readonly internalDetail?: string;
}

export interface AiDomainToolRegistryPreflightResult {
  readonly allowed: boolean;
  readonly toolName: AiDomainToolName | null;
  readonly definition: AiDomainToolDefinition | null;
  readonly errors: readonly import('../evidence/ai-domain-error.types').AiDomainError[];
}

export type AiDomainToolRegistryExecutor = (
  context: AiExecutionContext,
  input: Record<string, unknown>,
  nowMs: number,
) => Promise<AiDomainQueryOutcome<unknown>>;
