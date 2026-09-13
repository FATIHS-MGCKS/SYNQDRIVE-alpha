import { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { evaluatePhysicalStateTransition } from './device-connection-physical-state.policy';
import type {
  CurrentPhysicalStateProjection,
  PhysicalEvidenceSource,
} from './device-connection-physical-state.types';

const WEBHOOK = DeviceConnectionPhysicalEvidenceSource.WEBHOOK;
const SNAPSHOT = DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD;

function current(
  state: 'PLUGGED' | 'UNPLUGGED',
  at: string,
  source: PhysicalEvidenceSource = WEBHOOK,
  ref = 'ref-current',
): CurrentPhysicalStateProjection {
  return {
    effectiveState: state,
    evidenceObservedAt: new Date(at),
    evidenceSource: source,
    evidenceReferenceId: ref,
    stateVersion: 1,
  };
}

function incoming(
  state: 'PLUGGED' | 'UNPLUGGED',
  at: string,
  source: PhysicalEvidenceSource = WEBHOOK,
  ref = 'ref-incoming',
) {
  return {
    candidateState: state,
    evidenceObservedAt: new Date(at),
    evidenceSource: source,
    evidenceReferenceId: ref,
  };
}

describe('evaluatePhysicalStateTransition', () => {
  it('establishes baseline when no current state exists', () => {
    const result = evaluatePhysicalStateTransition({
      current: null,
      incoming: incoming('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap-1'),
    });
    expect(result.decision).toBe('ESTABLISHED');
    expect(result.mutateProjection).toBe(true);
    expect(result.nextState).toBe('PLUGGED');
  });

  it('marks duplicate when same state, timestamp, source, and reference', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('UNPLUGGED', '2026-09-12T14:27:51.000Z', WEBHOOK, 'wh-1'),
      incoming: incoming('UNPLUGGED', '2026-09-12T14:27:51.000Z', WEBHOOK, 'wh-1'),
    });
    expect(result.decision).toBe('DUPLICATE');
    expect(result.mutateProjection).toBe(false);
  });

  it('refreshes provenance for same state with newer evidence', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T14:00:00.000Z', SNAPSHOT, 'snap-old'),
      incoming: incoming('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap-new'),
    });
    expect(result.decision).toBe('PROVENANCE_REFRESH');
    expect(result.mutateProjection).toBe(true);
    expect(result.refreshProvenanceOnly).toBe(true);
  });

  it('rejects stale same-state evidence', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:02:29.000Z'),
      incoming: incoming('PLUGGED', '2026-09-12T14:27:47.000Z'),
    });
    expect(result.decision).toBe('STALE');
  });

  it('rejects stale opposing-state evidence', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:02:29.000Z'),
      incoming: incoming('UNPLUGGED', '2026-09-12T14:27:51.000Z'),
    });
    expect(result.decision).toBe('STALE');
  });

  it('applies newer opposing-state transition', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap-plug'),
      incoming: incoming('UNPLUGGED', '2026-09-12T16:27:51.000Z', WEBHOOK, 'wh-unplug'),
    });
    expect(result.decision).toBe('APPLIED');
    expect(result.nextState).toBe('UNPLUGGED');
  });

  it('conflicts on equal timestamp with opposing states', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:00:00.000Z', SNAPSHOT, 'snap'),
      incoming: incoming('UNPLUGGED', '2026-09-12T15:00:00.000Z', WEBHOOK, 'wh'),
    });
    expect(result.decision).toBe('CONFLICT');
    expect(result.mutateProjection).toBe(false);
  });

  it('rejects insufficient evidence when timestamp missing', () => {
    const result = evaluatePhysicalStateTransition({
      current: null,
      incoming: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date('invalid'),
        evidenceSource: SNAPSHOT,
        evidenceReferenceId: 'snap',
      },
    });
    expect(result.decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('orders webhook after snapshot using physical evidence time', () => {
    const afterSnapshot = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap'),
      incoming: incoming('UNPLUGGED', '2026-09-12T16:27:51.000Z', WEBHOOK, 'wh'),
    });
    expect(afterSnapshot.decision).toBe('APPLIED');

    const staleWebhook = evaluatePhysicalStateTransition({
      current: current('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap'),
      incoming: incoming('UNPLUGGED', '2026-09-12T14:27:51.000Z', WEBHOOK, 'wh-old'),
    });
    expect(staleWebhook.decision).toBe('STALE');
  });

  it('orders snapshot after webhook when per-signal OBD timestamp is newer', () => {
    const result = evaluatePhysicalStateTransition({
      current: current('UNPLUGGED', '2026-09-12T14:27:51.000Z', WEBHOOK, 'wh'),
      incoming: incoming('PLUGGED', '2026-09-12T15:02:29.000Z', SNAPSHOT, 'snap'),
    });
    expect(result.decision).toBe('APPLIED');
    expect(result.nextState).toBe('PLUGGED');
  });

  it('RB-001 guard: newer per-signal OBD timestamp wins over equal top-level source time', () => {
    const equalTopLevel = '2026-09-12T15:02:29.000Z';
    const result = evaluatePhysicalStateTransition({
      current: current('UNPLUGGED', equalTopLevel, WEBHOOK, 'wh'),
      incoming: incoming('PLUGGED', '2026-09-12T15:02:30.000Z', SNAPSHOT, 'snap-obd-ts'),
    });
    expect(result.decision).toBe('APPLIED');
  });
});
