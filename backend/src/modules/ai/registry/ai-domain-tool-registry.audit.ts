import type { AiDomainToolRegistryAuditPayload } from './ai-domain-tool-registry.types';
import type { AiDomainToolRegistryAuditEvent } from './ai-domain-tool-registry.enums';
import { sanitizeAiDomainDiagnosticText } from '../evidence/ai-domain-error.serialization';

export function buildAiDomainToolRegistryAuditPayload(
  input: Omit<AiDomainToolRegistryAuditPayload, 'internalDetail'> & {
    internalDetail?: string;
  },
): AiDomainToolRegistryAuditPayload {
  const detail = input.internalDetail
    ? sanitizeAiDomainDiagnosticText(input.internalDetail)
    : undefined;

  return {
    event: input.event,
    toolName: input.toolName,
    toolVersion: input.toolVersion,
    decision: input.decision,
    organizationId: input.organizationId,
    userId: input.userId,
    correlationId: input.correlationId,
    requestId: input.requestId,
    channel: input.channel,
    dataAccessPurpose: input.dataAccessPurpose,
    ...(input.partial != null ? { partial: input.partial } : {}),
    ...(input.durationMs != null ? { durationMs: input.durationMs } : {}),
    ...(input.code ? { code: input.code } : {}),
    ...(detail ? { internalDetail: detail } : {}),
  };
}

export function assertNoProviderDetailsInOutcome(data: unknown): void {
  if (data == null) {
    return;
  }
  const serialized = JSON.stringify(data).toLowerCase();
  const forbidden = [
    'prisma',
    'postgres',
    'clickhouse',
    'redis',
    'mistral',
    'dimo.dev',
    'connection_string',
    'database_url',
  ];
  for (const token of forbidden) {
    if (serialized.includes(token)) {
      throw new Error(`Outcome may leak provider or database detail: ${token}`);
    }
  }
}
