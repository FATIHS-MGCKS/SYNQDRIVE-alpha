import { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import {
  planPhysicalStatePreseed,
  selectPreseedWinner,
} from './physical-state-preseed.planner';
import type { PhysicalStatePreseedCandidate } from './physical-state-preseed.types';

describe('physical-state-preseed.planner', () => {
  const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 187336 });
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    tokenId: 187336,
  };

  const T1 = new Date('2026-08-01T10:00:00.000Z');
  const T2 = new Date('2026-09-12T15:02:29.000Z');

  function candidate(input: {
    state: 'PLUGGED' | 'UNPLUGGED';
    at: Date;
    source: DeviceConnectionPhysicalEvidenceSource;
    ref: string;
  }): PhysicalStatePreseedCandidate {
    return {
      candidateState: input.state,
      evidenceObservedAt: input.at,
      evidenceSource: input.source,
      evidenceReferenceId: input.ref,
      bindingKey: binding.bindingKey,
      provenance:
        input.source === DeviceConnectionPhysicalEvidenceSource.WEBHOOK
          ? 'dimo_webhook_event'
          : 'vehicle_latest_state_obd',
      sourceRecordId: input.ref,
    };
  }

  it('selects newer snapshot over older webhook', () => {
    const winner = selectPreseedWinner([
      candidate({ state: 'UNPLUGGED', at: T1, source: 'WEBHOOK', ref: 'wh-old' }),
      candidate({ state: 'PLUGGED', at: T2, source: 'SNAPSHOT_OBD', ref: 'snap-new' }),
    ]);
    expect(winner.ambiguous).toBe(false);
    expect(winner.winner?.evidenceReferenceId).toBe('snap-new');
  });

  it('selects newer webhook over older snapshot', () => {
    const winner = selectPreseedWinner([
      candidate({ state: 'PLUGGED', at: T1, source: 'SNAPSHOT_OBD', ref: 'snap-old' }),
      candidate({ state: 'UNPLUGGED', at: T2, source: 'WEBHOOK', ref: 'wh-new' }),
    ]);
    expect(winner.winner?.evidenceReferenceId).toBe('wh-new');
  });

  it('fails closed on equal-time opposing states', () => {
    const winner = selectPreseedWinner([
      candidate({ state: 'PLUGGED', at: T2, source: 'WEBHOOK', ref: 'wh-a' }),
      candidate({ state: 'UNPLUGGED', at: T2, source: 'SNAPSHOT_OBD', ref: 'snap-b' }),
    ]);
    expect(winner.ambiguous).toBe(true);
    expect(winner.winner).toBeNull();
  });

  it('equal-time same state uses lexicographic reference tie-break', () => {
    const winner = selectPreseedWinner([
      candidate({ state: 'PLUGGED', at: T2, source: 'WEBHOOK', ref: 'wh-z' }),
      candidate({ state: 'PLUGGED', at: T2, source: 'SNAPSHOT_OBD', ref: 'snap-a' }),
    ]);
    expect(winner.winner?.evidenceReferenceId).toBe('snap-a');
  });

  it('skips when projection already exists', () => {
    const plan = planPhysicalStatePreseed({
      scope,
      binding,
      existingProjection: {
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: T1,
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'existing',
        stateVersion: 1,
      },
      candidates: [candidate({ state: 'PLUGGED', at: T2, source: 'SNAPSHOT_OBD', ref: 'snap' })],
    });
    expect(plan.decision).toBe('SKIP_EXISTING_PROJECTION');
    expect(plan.wouldWrite.projection).toBe(false);
  });

  it('would establish with zero side-effect intents', () => {
    const plan = planPhysicalStatePreseed({
      scope,
      binding,
      existingProjection: null,
      candidates: [candidate({ state: 'UNPLUGGED', at: T2, source: 'WEBHOOK', ref: 'wh' })],
    });
    expect(plan.decision).toBe('WOULD_ESTABLISH');
    expect(plan.expectedReconcileDecision).toBe('ESTABLISHED');
    expect(plan.wouldWrite).toEqual({
      projection: true,
      transition: true,
      outbox: false,
      episode: false,
      alert: false,
      authorityMode: false,
      eventHistory: false,
    });
  });
});
