export type DimoR9WebhookOverallState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'CRITICAL'
  | 'UNKNOWN'
  | 'NOT_CONFIGURED'
  | 'STALE';

export interface DimoR9WebhookAlertDto {
  code: string;
  severity: string;
  failureCount?: number;
  tokenId?: number;
}

export interface DimoR9WebhookDefinitionDto {
  id: string;
  stableId: string;
  displayName: string | null;
  metricName: string | null;
  status: string | null;
  failureCount: number | null;
  triggerSemantics: string;
}

export interface DimoR9WebhookChannelDto {
  webhookId: string;
  kind: 'speed' | 'ignition';
  state: DimoR9WebhookOverallState;
  healthy: boolean;
  definition: DimoR9WebhookDefinitionDto | null;
  subscriberTokenIds: number[];
  expectedSubscriberTokenIds: number[];
  subscriberCount: number;
  alerts: DimoR9WebhookAlertDto[];
}

export interface DimoR9WebhookHealthDto {
  generatedAt: string;
  checkedAt: string | null;
  cacheExpiresAt: string | null;
  isStale: boolean;
  staleReason: string | null;
  overall: DimoR9WebhookOverallState;
  providerAccessState: string;
  lastSuccessfulProviderCheckAt: string | null;
  lastProviderError: { state: string; message: string; at: string } | null;
  refreshCadenceMs: number;
  minManualRefreshIntervalMs: number;
  rateLimitRetryAfterMs: number | null;
  servedFromCache: boolean;
  wakePipelineEvidence: 'NOT_EVALUATED';
  cohort: {
    expectedTokenIds: number[];
    excludedTokenIds: number[];
    excludedSubscribedTokenIds: number[];
  };
  speed: DimoR9WebhookChannelDto;
  ignition: DimoR9WebhookChannelDto;
  diagnostics: string[];
}
