/**
 * S4F-2 certification markers — closure authority references real Redis multi-replica tests
 * (`dimo-provider-budget.multi-replica.redis.integration.spec.ts`) and S4 composition audits.
 */
export const DI_V0_S4F2_PROVIDER_BACKPRESSURE_GAP_ID = 'DI-GAP-S4-PROVIDER-BACKPRESSURE-001';

export const DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION = {
  gapId: DI_V0_S4F2_PROVIDER_BACKPRESSURE_GAP_ID,
  gapStatus: 'CLOSED' as const,
  multiReplicaRedisIntegrationProven: true,
  multiReplicaInstanceCount: 2,
  certificationScope: 'ATOMIC_REDIS_INVARIANT_MULTI_REPLICA_SERVICE_OBJECTS',
  productionLoadCertification: 'NOT_CLAIMED',
  sharedTransportRetryOwner: 'SHARED_REQUEST_EXECUTOR',
  s4LocalRetryLoopPresent: false,
} as const;
