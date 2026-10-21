import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import type { CurrentPhysicalStateProjection } from './device-connection-physical-state.types';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';

/**
 * Adversarial sequences for source-time ordering (device-connection-physical-state.policy).
 * Contract: evidenceObservedAt is the physical ordering key; late arrival with older source time is STALE.
 */
describe('physical-state provenance clock adversarial sequences', () => {
  const basePlugged: CurrentPhysicalStateProjection = {
    effectiveState: 'PLUGGED',
    evidenceObservedAt: new Date('2026-09-23T07:41:00.000Z'),
    evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
    evidenceReferenceId: 'webhook:base',
    stateVersion: 5,
  };

  function step(
    current: CurrentPhysicalStateProjection | null,
    candidateState: 'PLUGGED' | 'UNPLUGGED',
    evidenceObservedAt: Date,
    source: DeviceConnectionPhysicalEvidenceSource,
    ref: string,
  ) {
    return evaluatePhysicalStateTransition({
      current,
      incoming: {
        candidateState,
        evidenceObservedAt,
        evidenceSource: source,
        evidenceReferenceId: ref,
      },
    });
  }

  it('Case A — refresh T200 then UNPLUG T250 => APPLIED', () => {
    const refresh = step(
      basePlugged,
      'PLUGGED',
      new Date('2026-09-23T07:41:49.000Z'),
      DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      'webhook:refresh',
    );
    expect(refresh.decision).toBe(DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH);
    const afterRefresh: CurrentPhysicalStateProjection = {
      ...basePlugged,
      evidenceObservedAt: new Date('2026-09-23T07:41:49.000Z'),
      evidenceReferenceId: 'webhook:refresh',
      stateVersion: 6,
    };
    const unplug = step(
      afterRefresh,
      'UNPLUGGED',
      new Date('2026-09-23T07:41:53.000Z'),
      DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      'webhook:unplug',
    );
    expect(unplug.decision).toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
  });

  it('Case B — refresh T200 then UNPLUG T150 => STALE (historical source time)', () => {
    const afterRefresh: CurrentPhysicalStateProjection = {
      ...basePlugged,
      evidenceObservedAt: new Date('2026-09-23T07:41:49.000Z'),
      evidenceReferenceId: 'webhook:refresh',
      stateVersion: 6,
    };
    const staleUnplug = step(
      afterRefresh,
      'UNPLUGGED',
      new Date('2026-09-23T07:41:20.000Z'),
      DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      'webhook:late-arrival-old-ts',
    );
    expect(staleUnplug.decision).toBe(DeviceConnectionPhysicalTransitionDecision.STALE);
  });

  it('Case C — snapshot refresh T200 then webhook UNPLUG T201 => APPLIED', () => {
    const afterRefresh: CurrentPhysicalStateProjection = {
      ...basePlugged,
      evidenceObservedAt: new Date('2026-09-23T10:00:00.000Z'),
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      evidenceReferenceId: 'snap:refresh',
      stateVersion: 7,
    };
    const unplug = step(
      afterRefresh,
      'UNPLUGGED',
      new Date('2026-09-23T10:00:01.000Z'),
      DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      'webhook:unplug',
    );
    expect(unplug.decision).toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
  });

  it('Case D — webhook refresh T200 then snapshot UNPLUG T201 => APPLIED', () => {
    const afterRefresh: CurrentPhysicalStateProjection = {
      ...basePlugged,
      evidenceObservedAt: new Date('2026-09-23T10:00:00.000Z'),
      evidenceReferenceId: 'webhook:refresh',
      stateVersion: 8,
    };
    const unplug = step(
      afterRefresh,
      'UNPLUGGED',
      new Date('2026-09-23T10:00:01.000Z'),
      DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      'snap:unplug',
    );
    expect(unplug.decision).toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
  });

  it('Case E — equal-time opposing state => CONFLICT', () => {
    const t = new Date('2026-09-23T10:00:00.000Z');
    const atT: CurrentPhysicalStateProjection = {
      ...basePlugged,
      evidenceObservedAt: t,
      evidenceReferenceId: 'webhook:plug-at-t',
    };
    const conflict = step(
      atT,
      'UNPLUGGED',
      t,
      DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      'snap:unplug',
    );
    expect(conflict.decision).toBe(DeviceConnectionPhysicalTransitionDecision.CONFLICT);
  });

  it('Case F — older same-state evidence => STALE', () => {
    const stale = step(
      basePlugged,
      'PLUGGED',
      new Date('2026-09-23T07:40:00.000Z'),
      DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
      'snap:old',
    );
    expect(stale.decision).toBe(DeviceConnectionPhysicalTransitionDecision.STALE);
  });
});
