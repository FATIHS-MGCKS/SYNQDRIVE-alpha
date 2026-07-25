import type { AiEvidence } from '../../evidence/ai-evidence.types';
import type { FleetChatRouteResult } from '../../routing/fleet-chat-intent.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';
import type { FleetChatResponseActionKind, FleetChatResponseType } from './fleet-chat-evidence-response.enums';

export interface FleetChatEvidenceComposeInput {
  readonly correlationId: string;
  readonly userMessage: string;
  readonly language: 'de' | 'en' | 'unknown';
  readonly route: FleetChatRouteResult;
  readonly toolRecords: readonly FleetChatToolExecutionRecord[];
  readonly mergedEvidence: readonly AiEvidence[];
  readonly partial: boolean;
  readonly allowLlmInference: boolean;
  readonly llmRawText?: string | null;
}

export interface FleetChatResponseVehicleRef {
  readonly displayName: string | null;
  readonly licensePlate: string | null;
}

export interface FleetChatDataFreshnessSummary {
  readonly freshness: string;
  readonly observedAt: string | null;
  readonly isLastKnown: boolean;
  readonly label: string | null;
}

export interface FleetChatResponseSourceRef {
  readonly tool: string;
  readonly label: string;
}

export interface FleetChatResponseAction {
  readonly kind: FleetChatResponseActionKind;
  readonly messageDe: string;
  readonly messageEn: string;
}

export interface FleetChatEvidenceSummaryItem {
  readonly source: string;
  readonly summary: string;
  readonly freshness: string;
  readonly availability: string;
}

export interface FleetChatEvidenceApiResponse {
  readonly text: string;
  readonly responseType: FleetChatResponseType;
  readonly vehicle: FleetChatResponseVehicleRef | null;
  readonly dataFreshness: FleetChatDataFreshnessSummary;
  readonly sources: readonly FleetChatResponseSourceRef[];
  readonly warnings: readonly string[];
  readonly partial: boolean;
  readonly generatedAt: string;
  readonly correlationId: string;
  readonly actions?: readonly FleetChatResponseAction[];
  readonly evidenceSummary?: readonly FleetChatEvidenceSummaryItem[];
  readonly usedDeterministicFallback: boolean;
}

export interface FleetChatEvidencePrepareResult {
  readonly directResponse: string | null;
  readonly llmUserContext: string | null;
  readonly skipLlm: boolean;
  readonly responseType: FleetChatResponseType;
}
