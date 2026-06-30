import { DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY } from './dimo-agent-personality.util';
import { DimoAgentErrorKind } from './dimo-agent-error-classification.util';

/** Isolated DIMO AI agent use cases — each maps to its own cache scope and agent history. */
export type DimoAgentUseCase =
  | 'vehicle_specs'
  | 'tire_specs'
  | 'document_extraction'
  | 'fleet_chat';

/** @deprecated Use DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY from dimo-agent-personality.util.ts */
export const DIMO_AGENT_DEFAULT_PERSONALITY = DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY;

export interface GetOrCreateAgentInput {
  useCase: DimoAgentUseCase;
  personality?: string;
  userWallet?: string;
  vehicleIds?: number[];
  orgId?: string;
}

export interface GetOrCreateAgentResult {
  success: boolean;
  agentId?: string;
  cacheKey?: string;
  error?: string;
  errorKind?: DimoAgentErrorKind;
  errorCode?: string;
  failedBeforeHttp?: boolean;
  configFailure?: boolean;
  statusCode?: number;
}
