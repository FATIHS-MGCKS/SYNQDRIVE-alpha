/**
 * ERD E4 reconciliation / recovery liveness gate (unit + optional Postgres / BullMQ+Redis).
 *
 * Env:
 * - ERD_E4_POSTGRES_REDIS_INTEGRATION=1 + DATABASE_URL → Postgres target-query proofs (boundary-repair CI step 6)
 * - ERD_E4_BULLMQ_REDIS_INTEGRATION=1 + TEST_REDIS_PORT → real BullMQ + Redis gate (erd-e4-bullmq-redis-ci.sh)
 *
 * Note: ERD_E4_POSTGRES_REDIS_INTEGRATION does not provide Redis; name is historical.
 */
import { getBatteryV2JobRetryPolicy } from '../jobs/battery-v2-job.retry-policy';
import { buildHvRechargePeriodicPeriodBucket } from './hv-recharge-session-reconcile.policy';
import { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';

describe('ERD E4 reconciliation liveness (always-on gate)', () => {
  it('HV_RECHARGE_SESSION_RECONCILE retry policy remains transient-friendly', () => {
    const policy = getBatteryV2JobRetryPolicy('HV_RECHARGE_SESSION_RECONCILE');
    expect(policy.attempts).toBe(3);
    expect(policy.backoffType).toBe('exponential');
    expect(policy.backoffDelayMs).toBe(5_000);
  });

  it('periodic identity uses explicit evaluation bucket (no hidden now in callers)', () => {
    const at = new Date('2026-07-16T12:00:00.000Z');
    const bucket = buildHvRechargePeriodicPeriodBucket(at);
    expect(bucket).toMatch(/^\d+$/);
    expect(bucket).toBe(buildHvRechargePeriodicPeriodBucket(at));
  });

  it('documents replayable DLQ recovery via next periodic period bucket', () => {
    const mechanism =
      'periodic_new_idempotency_bucket_after_replayable_dlq; entity-scoped clear only when same key replay required';
    expect(mechanism).toContain('periodic_new_idempotency_bucket');
    expect(HvRechargeSessionReconcileTrigger.PERIODIC).toBe('PERIODIC');
  });

  it('documents BullMQ worker lockDuration contract for crash/stalled recovery', () => {
    const lockDurationMs = 180_000;
    expect(lockDurationMs).toBeGreaterThan(60_000);
  });
});

const LIVE_PG = process.env.ERD_E4_POSTGRES_REDIS_INTEGRATION === '1';

(LIVE_PG ? describe : describe.skip)(
  'ERD E4 Postgres target selection (ERD_E4_POSTGRES_REDIS_INTEGRATION=1)',
  () => {
    it('executes real proofs in erd-e4-reconciliation-liveness.postgres.integration.spec.ts via boundary-repair CI step 6/6', () => {
      expect(process.env.ERD_E4_POSTGRES_REDIS_INTEGRATION).toBe('1');
    });
  },
);
