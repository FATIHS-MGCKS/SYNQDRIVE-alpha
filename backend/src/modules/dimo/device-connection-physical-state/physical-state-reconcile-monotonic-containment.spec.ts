import { DeviceConnectionPhysicalEvidenceSource, DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';
import { buildPhysicalStateIdempotencyKey } from './device-connection-physical-state.binding';

/**
 * Documents monotonic containment for concurrent/out-of-order evidence without DB.
 * Repository serialization: pg_advisory_xact_lock + SELECT FOR UPDATE (see repository).
 */
describe('physical-state reconcile monotonic containment', () => {
  const T1 = new Date('2026-09-17T08:07:14.000Z');
  const T2 = new Date('2026-09-18T00:03:43.588Z');

  const projectionAtT2 = {
    effectiveState: 'PLUGGED' as const,
    evidenceObservedAt: T2,
    evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
    evidenceReferenceId: 'wh-reconnect',
    stateVersion: 2,
  };

  it('CONCURRENT T2 then T1: older evidence is STALE (no regression)', () => {
    const result = evaluatePhysicalStateTransition({
      current: projectionAtT2,
      incoming: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-stale',
      },
    });
    expect(result.decision).toBe(DeviceConnectionPhysicalTransitionDecision.STALE);
    expect(result.mutateProjection).toBe(false);
  });

  it('CONCURRENT T2 and T2 same evidence instant: DUPLICATE not APPLIED', () => {
    const duplicate = evaluatePhysicalStateTransition({
      current: {
        ...projectionAtT2,
        evidenceReferenceId: 'snap-dup-a',
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      },
      incoming: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: T2,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-dup-a',
      },
    });
    expect(duplicate.decision).toBe(DeviceConnectionPhysicalTransitionDecision.DUPLICATE);
    expect(duplicate.mutateProjection).toBe(false);
  });

  it('CONCURRENT T2 replays with different reference at same instant: PROVENANCE_REFRESH only', () => {
    const refresh = evaluatePhysicalStateTransition({
      current: projectionAtT2,
      incoming: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: T2,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-dup-b',
      },
    });
    expect(refresh.decision).toBe(DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH);
    expect(refresh.refreshProvenanceOnly).toBe(true);
  });

  it('idempotency key is stable for duplicate concurrent inserts', () => {
    const keyA = buildPhysicalStateIdempotencyKey({
      organizationId: 'org',
      vehicleId: 'veh',
      provider: 'DIMO',
      bindingKey: 'binding',
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'ref',
      evidenceObservedAt: T2,
      candidateState: 'PLUGGED',
    });
    const keyB = buildPhysicalStateIdempotencyKey({
      organizationId: 'org',
      vehicleId: 'veh',
      provider: 'DIMO',
      bindingKey: 'binding',
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'ref',
      evidenceObservedAt: T2,
      candidateState: 'PLUGGED',
    });
    expect(keyA).toBe(keyB);
  });
});
