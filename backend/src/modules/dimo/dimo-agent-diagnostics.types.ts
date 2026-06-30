import { DimoAgentUseCase } from './dimo-agent-use-case.types';

/** Harmless prompt used for live agent diagnostics — no customer data. */
export const DIMO_AGENT_DIAGNOSTIC_TEST_PROMPT =
  'Reply with the exact JSON: {"status":"ok"}';

export interface DimoAgentDiagnosticsOptions {
  /** DIMO NFT tokenId for optional scoped vehicle test. */
  dimoTokenId?: number;
  /** Use case used for ephemeral diagnostic agent create/stream tests. */
  useCase?: DimoAgentUseCase;
  /** When true, skip create/message/stream live calls (config-only probe). */
  skipLiveTests?: boolean;
}

export type DimoAgentDiagnosticPhase =
  | 'config'
  | 'cache'
  | 'create'
  | 'message'
  | 'stream'
  | 'parser'
  | 'vehicle_scope';

export interface DimoAgentDiagnosticCheck {
  name: string;
  ok: boolean;
  durationMs?: number;
  detail?: string;
  statusCode?: number;
  receivedContent?: boolean;
  phase?: DimoAgentDiagnosticPhase;
}

export interface DimoAgentDiagnosticsResult {
  configured: boolean;
  baseUrl: string;
  baseUrlSource: 'env' | 'default';
  hasApiKey: boolean;
  hasUserWallet: boolean;
  walletMasked?: string;
  hasDeveloperJwt?: boolean;
  personalities: Record<DimoAgentUseCase, string>;
  checks: DimoAgentDiagnosticCheck[];
  errors: string[];
}
