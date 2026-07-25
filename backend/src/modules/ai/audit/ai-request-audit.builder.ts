import type { AiEvidenceSensitivity, AiEvidenceSource } from '../evidence/ai-evidence.enums';
import type { AiDomainToolRegistryAuditPayload } from '../registry/ai-domain-tool-registry.types';
import type { FleetChatOrchestrateResult } from '../chat/fleet-chat-orchestrator.types';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { AI_DOMAIN_TOOL_DEFINITION_BY_NAME } from '../registry/ai-domain-tool-registry.definitions';
import {
  assertNoForbiddenContentInAuditPayload,
  buildPseudonymizedUserRef,
  redactVehicleRefForAudit,
  sanitizeAuditScalar,
} from './ai-request-audit.serialization';

const SENSITIVITY_ORDER: readonly AiEvidenceSensitivity[] = [
  'public',
  'internal',
  'pii',
  'restricted',
];

export function maxDataClassification(
  levels: readonly AiEvidenceSensitivity[],
): AiEvidenceSensitivity {
  if (levels.length === 0) {
    return 'internal';
  }
  let maxIdx = 0;
  for (const level of levels) {
    const idx = SENSITIVITY_ORDER.indexOf(level);
    if (idx > maxIdx) {
      maxIdx = idx;
    }
  }
  return SENSITIVITY_ORDER[maxIdx] ?? 'internal';
}

export function collectDataSourcesFromResult(
  result: FleetChatOrchestrateResult,
): readonly AiEvidenceSource[] {
  const sources = new Set<AiEvidenceSource>();
  for (const evidence of result.mergedEvidence) {
    sources.add(evidence.source);
  }
  return [...sources];
}

export function collectToolAuditDurations(result: FleetChatOrchestrateResult) {
  return result.toolRecords.map((record) => ({
    toolName: record.toolName,
    durationMs: record.durationMs,
    success: record.success,
    errorCodes: record.outcome.errors.map((e) => e.code),
  }));
}

export function collectErrorCodes(result: FleetChatOrchestrateResult): string[] {
  const codes = new Set<string>();
  for (const record of result.toolRecords) {
    for (const error of record.outcome.errors) {
      codes.add(error.code);
    }
  }
  return [...codes];
}

export function buildFleetRequestAuditCreateInput(
  context: AiExecutionContext,
  result: FleetChatOrchestrateResult,
  options: {
    storePlainUserId: boolean;
    userIdRefPepper: string;
    jwtSecretFallback: string;
  },
) {
  const toolClassifications = result.toolRecords.map((record) => {
    const def = AI_DOMAIN_TOOL_DEFINITION_BY_NAME[record.toolName];
    return def?.dataClassification ?? 'internal';
  });
  const evidenceClassifications = result.mergedEvidence.map((e) => e.sensitivity);
  const dataClassification = maxDataClassification([
    ...toolClassifications,
    ...evidenceClassifications,
  ]);

  const resolvedVehicleRef = redactVehicleRefForAudit({
    displayName: result.route.vehicleResolution.displayName,
    licensePlate: result.route.vehicleResolution.licensePlate,
  });

  const payload = {
    eventKind: 'REQUEST' as const,
    organizationId: context.organizationId,
    userId: options.storePlainUserId ? context.userId : null,
    userIdRef: options.storePlainUserId
      ? context.userId
      : buildPseudonymizedUserRef(
          context.userId,
          context.organizationId,
          options.userIdRefPepper || options.jwtSecretFallback,
        ),
    membershipRole: context.role,
    correlationId: sanitizeAuditScalar(context.correlationId, 64),
    requestId: sanitizeAuditScalar(context.requestId, 64),
    channel: sanitizeAuditScalar(context.channel, 32),
    primaryIntent: result.audit.primaryIntent,
    detectedIntents: result.audit.detectedIntents,
    resolvedVehicleId: result.route.vehicleResolution.resolvedVehicleId,
    resolvedVehicleRef,
    toolsUsed: result.audit.toolsRequested,
    dataSources: collectDataSourcesFromResult(result),
    toolDurations: collectToolAuditDurations(result),
    errorCodes: collectErrorCodes(result),
    responseType: result.structuredResponse?.responseType ?? null,
    partial: result.partial,
    resultComplete: !result.partial,
    dataClassification,
    modelProvider: result.audit.modelProvider,
    modelName: result.audit.modelName,
    tokenUsage: result.audit.tokenUsage,
    llmUsed: result.llmUsed,
    performance: result.performance,
    securityFlags: result.audit.securityFlags,
    toolName: null,
    toolDecision: null,
    toolDurationMs: null,
  };

  assertNoForbiddenContentInAuditPayload(JSON.stringify(payload));
  return payload;
}

export function buildToolAuditCreateInput(
  payload: AiDomainToolRegistryAuditPayload,
  options: {
    storePlainUserId: boolean;
    userIdRefPepper: string;
    jwtSecretFallback: string;
    membershipRole?: string;
  },
) {
  const auditPayload = {
    eventKind: 'TOOL' as const,
    organizationId: payload.organizationId,
    userId: options.storePlainUserId ? payload.userId : null,
    userIdRef: options.storePlainUserId
      ? payload.userId
      : buildPseudonymizedUserRef(
          payload.userId,
          payload.organizationId,
          options.userIdRefPepper || options.jwtSecretFallback,
        ),
    membershipRole: options.membershipRole ?? 'UNKNOWN',
    correlationId: sanitizeAuditScalar(payload.correlationId, 64),
    requestId: sanitizeAuditScalar(payload.requestId, 64),
    channel: sanitizeAuditScalar(payload.channel, 32),
    primaryIntent: null,
    detectedIntents: [],
    resolvedVehicleId: null,
    resolvedVehicleRef: null,
    toolsUsed: [payload.toolName],
    dataSources: [],
    toolDurations: [
      {
        toolName: payload.toolName,
        durationMs: payload.durationMs ?? 0,
        success: payload.decision === 'allow',
        errorCodes: payload.code ? [payload.code] : [],
      },
    ],
    errorCodes: payload.code ? [payload.code] : [],
    responseType: null,
    partial: payload.partial ?? false,
    resultComplete: payload.decision === 'allow',
    dataClassification: AI_DOMAIN_TOOL_DEFINITION_BY_NAME[payload.toolName]?.dataClassification ?? 'internal',
    modelProvider: null,
    modelName: null,
    tokenUsage: null,
    llmUsed: false,
    performance: null,
    securityFlags: [],
    toolName: payload.toolName,
    toolDecision: payload.decision,
    toolDurationMs: payload.durationMs ?? null,
  };

  assertNoForbiddenContentInAuditPayload(JSON.stringify(auditPayload));
  return auditPayload;
}
