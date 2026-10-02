import { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { buildSameStateProofParentFromReconcileContext } from './physical-state-same-state-proof-parent';
import type { PhysicalStateReconcileContext } from './device-connection-physical-state.types';

describe('buildSameStateProofParentFromReconcileContext', () => {
  const base: PhysicalStateReconcileContext = {
    previousState: 'PLUGGED',
    candidateState: 'PLUGGED',
    resultingState: 'PLUGGED',
    previousEvidenceAt: new Date('2026-09-20T10:00:00.000Z'),
    previousEvidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
    previousEvidenceReferenceId: 'wh:parent',
    candidateEvidenceAt: new Date('2026-09-20T10:00:05.000Z'),
    incomingEvidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
    stateVersionBefore: 4,
    stateVersionAfter: 5,
    selfHeal: false,
    evidenceReferenceId: 'snap:child',
  };

  it('returns null when stateVersionBefore is null (fail-closed — no stateVersion=0 manufacture)', () => {
    const parent = buildSameStateProofParentFromReconcileContext({
      ...base,
      stateVersionBefore: null,
    });
    expect(parent).toBeNull();
  });

  it('returns projection when all parent fields are present', () => {
    const parent = buildSameStateProofParentFromReconcileContext(base);
    expect(parent).toEqual({
      effectiveState: 'PLUGGED',
      evidenceObservedAt: base.previousEvidenceAt,
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: 'wh:parent',
      stateVersion: 4,
    });
  });
});
