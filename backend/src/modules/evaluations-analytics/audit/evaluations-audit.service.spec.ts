import { EvaluationsAuditService } from './evaluations-audit.service';
import {
  BusinessAuditAction,
  BUSINESS_AUDIT_ENTITY_TYPE,
} from '@modules/business-audit/business-audit.constants';

function build(enqueueImpl?: jest.Mock, flushImpl?: jest.Mock) {
  const enqueue = enqueueImpl ?? jest.fn().mockResolvedValue({ id: 'ob-1' });
  const flushCritical = flushImpl ?? jest.fn().mockResolvedValue(undefined);
  const audit = new EvaluationsAuditService({ enqueue, flushCritical } as never);
  return { audit, enqueue, flushCritical };
}

describe('EvaluationsAuditService (reuses canonical BusinessAudit outbox)', () => {
  it('records DENIED person-level access with the canonical action/entity + no PII', async () => {
    const { audit, enqueue } = build();
    await audit.recordPersonLevelAccess({
      organizationId: 'org-a',
      actorUserId: 'user-1',
      result: 'DENIED',
      piiTier: 'none',
      stationScoped: false,
      factorCount: 0,
      calculationVersion: 'driver-influence-e4-v1',
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const input = enqueue.mock.calls[0][0];
    expect(input.action).toBe(BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_DENIED);
    expect(input.entityType).toBe(BUSINESS_AUDIT_ENTITY_TYPE.EVALUATIONS_DRIVER_ANALYTICS);
    expect(input.organizationId).toBe('org-a');
    expect(input.actorUserId).toBe('user-1');
    expect(input.outcome).toBe('DENIED');
    // entityId is a scope token, never a person id.
    expect(input.entityId).toBe('org:org-a:driver-analytics');
    // metadata is non-PII (tier/scope/counts only).
    expect(input.metadata).toEqual({
      piiTier: 'none',
      stationScoped: false,
      factorCount: 0,
      calculationVersion: 'driver-influence-e4-v1',
    });
  });

  it('records SUCCEEDED with the accessed action code', async () => {
    const { audit, enqueue } = build();
    await audit.recordPersonLevelAccess({
      organizationId: 'org-a',
      actorUserId: 'user-1',
      result: 'SUCCEEDED',
      piiTier: 'pseudonymous',
      stationScoped: false,
      factorCount: 2,
      calculationVersion: 'driver-influence-e4-v1',
    });
    expect(enqueue.mock.calls[0][0].action).toBe(
      BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_ACCESSED,
    );
  });

  it('uses a unique idempotency key per access', async () => {
    const { audit, enqueue } = build();
    const call = () =>
      audit.recordPersonLevelAccess({
        organizationId: 'org-a',
        actorUserId: 'user-1',
        result: 'SUCCEEDED',
        piiTier: 'full',
        stationScoped: false,
        factorCount: 1,
        calculationVersion: 'v',
      });
    await call();
    await call();
    const k1 = enqueue.mock.calls[0][0].idempotencyKey;
    const k2 = enqueue.mock.calls[1][0].idempotencyKey;
    expect(k1).not.toBe(k2);
    expect(k1.startsWith('evaluations-driver-access:org-a:')).toBe(true);
  });

  it('is best-effort: an audit enqueue failure never throws to the read path', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('db down'));
    const { audit } = build(failing);
    await expect(
      audit.recordPersonLevelAccess({
        organizationId: 'org-a',
        actorUserId: 'user-1',
        result: 'SUCCEEDED',
        piiTier: 'full',
        stationScoped: false,
        factorCount: 1,
        calculationVersion: 'v',
      }),
    ).resolves.toBeUndefined();
  });

  it('E5.1B: durable-critical disclosure flushes the enqueued outbox id before returning', async () => {
    const { audit, enqueue, flushCritical } = build();
    await audit.recordCriticalPersonLevelDisclosure({
      organizationId: 'org-a',
      actorUserId: 'user-1',
      result: 'SUCCEEDED',
      piiTier: 'full',
      stationScoped: false,
      factorCount: 2,
      calculationVersion: 'driver-influence-e4-v1',
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].action).toBe(
      BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_ACCESSED,
    );
    expect(flushCritical).toHaveBeenCalledWith(['ob-1']);
  });

  it('E5.1B: durable-critical disclosure PROPAGATES a flush failure (caller fails closed)', async () => {
    const flushing = jest.fn().mockRejectedValue(new Error('BUSINESS_AUDIT_OUTBOX_FLUSH_FAILED'));
    const { audit } = build(undefined, flushing);
    await expect(
      audit.recordCriticalPersonLevelDisclosure({
        organizationId: 'org-a',
        actorUserId: 'user-1',
        result: 'SUCCEEDED',
        piiTier: 'full',
        stationScoped: false,
        factorCount: 2,
        calculationVersion: 'driver-influence-e4-v1',
      }),
    ).rejects.toThrow('BUSINESS_AUDIT_OUTBOX_FLUSH_FAILED');
  });
});
