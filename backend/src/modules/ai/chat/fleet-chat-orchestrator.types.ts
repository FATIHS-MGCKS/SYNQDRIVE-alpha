import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import type { AiEvidence } from '../evidence/ai-evidence.types';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { FleetChatIntent } from '../routing/fleet-chat-intent.enums';
import type { FleetChatAnswerScenario } from './fleet-chat-policy/fleet-chat-policy.constants';

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
  readonly channel: string;
  readonly primaryIntent: FleetChatIntent;
  readonly detectedIntents: readonly FleetChatIntent[];
  readonly toolsRequested: readonly AiDomainToolName[];
  readonly toolsSucceeded: readonly AiDomainToolName[];
  readonly toolsFailed: readonly AiDomainToolName[];
  readonly partial: boolean;
  readonly securityFlags: readonly string[];
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
  readonly activeScenarios?: readonly FleetChatAnswerScenario[];
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
}

export interface FleetChatOrchestrateInput {
  readonly message: string;
  readonly bookingId?: string | null;
}
