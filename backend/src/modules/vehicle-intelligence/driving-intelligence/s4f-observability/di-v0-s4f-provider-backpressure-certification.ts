/**
 * S4F-2 certification markers — closure authority references real Redis multi-replica tests
 * (`dimo-provider-budget.multi-replica.redis.integration.spec.ts`) and S4 composition audits.
 */
export const DI_V0_S4F2_PROVIDER_BACKPRESSURE_GAP_ID = 'DI-GAP-S4-PROVIDER-BACKPRESSURE-001';

export type DiV0S4f2ProviderBackpressureGapStatus = 'CLOSURE_CANDIDATE' | 'CLOSED';

export const DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION = {
  gapId: DI_V0_S4F2_PROVIDER_BACKPRESSURE_GAP_ID,
  gapStatus: 'CLOSURE_CANDIDATE' as DiV0S4f2ProviderBackpressureGapStatus,
  /** Reserved HIGH slots apply during normal admission only — not during global provider cooldown (P1.3 acquire step 2). */
  highPriorityReservedCapacityAppliesDuring: 'NORMAL_ADMISSION_ONLY' as const,
  globalCooldownBlocksAllPriorities: true,
  globalCooldownAuthorityRef:
    'architecture/P1_3_GLOBAL_DIMO_PROVIDER_BUDGET_FINAL_RESPONSE_2026-08-29.md §3 acquire algorithm step 2',
  multiReplicaRedisIntegrationProven: true,
  multiReplicaInstanceCount: 2,
  certificationScope: 'ATOMIC_REDIS_INVARIANT_MULTI_REPLICA_SERVICE_OBJECTS',
  productionLoadCertification: 'NOT_CLAIMED',
  sharedTransportRetryOwner: 'SHARED_REQUEST_EXECUTOR',
  s4LocalRetryLoopPresent: false,
} as const;
