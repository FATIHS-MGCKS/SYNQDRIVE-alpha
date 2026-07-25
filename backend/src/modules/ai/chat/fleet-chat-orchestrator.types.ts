import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import type { AiEvidence } from '../evidence/ai-evidence.types';
import type { AiEvidenceSensitivity } from '../evidence/ai-evidence.enums';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { FleetChatIntent } from '../routing/fleet-chat-intent.enums';
import type { FleetChatEvidenceApiResponse } from './fleet-chat-evidence-response/fleet-chat-evidence-response.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response/fleet-chat-evidence-response.enums';
import type { LlmUsage } from '../llm/llm.types';
import type { MembershipRole } from '@prisma/client';

export const FLEET_CHAT_ORCHESTRATOR_LLM_TIMEOUT_MS = 25_000;
export const FLEET_CHAT_ORCHESTRATOR_TOOL_BUDGET_MS = 30_000;
export const FLEET_CHAT_MAX_LLM_CONTEXT_CHARS = 6_000;

export interface FleetChatToolExecutionRecord {
  readonly toolName: AiDomainToolName;
  readonly outcome: AiDomainQueryOutcome<unknown>;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface FleetChatOrchestratorAudit {
  readonly correlationId: string;
  readonly requestId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MembershipRole | 'MASTER_ADMIN';
  readonly channel: string;
  readonly primaryIntent: FleetChatIntent;
  readonly detectedIntents: readonly FleetChatIntent[];
  readonly toolsRequested: readonly AiDomainToolName[];
  readonly toolsSucceeded: readonly AiDomainToolName[];
  readonly toolsFailed: readonly AiDomainToolName[];
  readonly partial: boolean;
  readonly resultComplete: boolean;
  readonly securityFlags: readonly string[];
  readonly responseType: FleetChatResponseType | null;
  readonly resolvedVehicleId: string | null;
  readonly dataClassification: AiEvidenceSensitivity;
  readonly dataSources: readonly string[];
  readonly toolsUsed: readonly AiDomainToolName[];
  readonly errorCodes: readonly string[];
  readonly modelProvider: string | null;
  readonly modelName: string | null;
  readonly tokenUsage: LlmUsage | null;
  readonly timestamp: string;
}

export interface FleetChatOrchestratorPerformance {
  readonly routingMs: number;
  readonly toolsMs: number;
  readonly compositionMs: number;
  readonly llmMs: number;
  readonly totalMs: number;
}

export interface FleetChatComposerInput {
  readonly userMessage: string;
  readonly language: 'de' | 'en' | 'unknown';
  readonly route: FleetChatRouteResult;
  readonly toolRecords: readonly FleetChatToolExecutionRecord[];
  readonly evidenceSummaries: readonly FleetChatEvidenceSummary[];
  readonly partial: boolean;
  readonly allowLlmInference: boolean;
}

export interface FleetChatEvidenceSummary {
  readonly source: string;
  readonly factKind: string;
  readonly freshness: string;
  readonly availability: string;
  readonly confidence: string;
  readonly summary: string;
}

export interface FleetChatOrchestrateResult {
  readonly responseText: string;
  readonly route: FleetChatRouteResult;
  readonly toolRecords: readonly FleetChatToolExecutionRecord[];
  readonly mergedEvidence: readonly AiEvidence[];
  readonly partial: boolean;
  readonly allowLlmInference: boolean;
  readonly audit: FleetChatOrchestratorAudit;
  readonly performance: FleetChatOrchestratorPerformance;
  readonly llmUsed: boolean;
  readonly structuredResponse?: FleetChatEvidenceApiResponse;
}

export interface FleetChatOrchestrateInput {
  readonly message: string;
  readonly bookingId?: string | null;
}
