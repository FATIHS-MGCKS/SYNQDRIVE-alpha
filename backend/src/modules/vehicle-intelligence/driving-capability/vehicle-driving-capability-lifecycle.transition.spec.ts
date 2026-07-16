import { DrivingCapabilityStatus } from '@prisma/client';
import {
  buildLifecycleMetadata,
  computeNextLossStreak,
  detectCapabilityTransitions,
  hasSignalReappeared,
  shouldScheduleSignalLossRetry,
} from './vehicle-driving-capability-lifecycle.transition';

function row(
  capabilityKey: string,
  status: DrivingCapabilityStatus,
  metadata?: Record<string, unknown>,
) {
  return {
    capabilityKey,
    capabilityStatus: status,
    metadata: metadata ?? {},
    providerSource: 'DIMO_TELEMETRY',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    hardwareProfile: 'LTE_R1',
    signalName: capabilityKey,
    detectorName: null,
    firstSeenAt: new Date('2026-06-01T00:00:00Z'),
    lastSeenAt: new Date('2026-07-15T00:00:00Z'),
    checkedAt: new Date('2026-07-15T00:00:00Z'),
    capabilityVersion: 'cap-preflight-v1',
    id: `row-${capabilityKey}`,
    effectiveCadenceMs: null,
    p95CadenceMs: null,
    coverage: null,
    nativeEventAvailable: false,
  } as any;
}

describe('vehicle-driving-capability-lifecycle.transition', () => {
  it('detects SIGNAL_LOST when supported signal disappears', () => {
    const before = [row('powertrainCombustionEngineSpeed', DrivingCapabilityStatus.SUPPORTED)];
    const after = [row('powertrainCombustionEngineSpeed', DrivingCapabilityStatus.UNSUPPORTED)];
    const transitions = detectCapabilityTransitions(before, after);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.kind).toBe('SIGNAL_LOST');
  });

  it('detects SIGNAL_RECOVERED when signal reappears', () => {
    const before = [row('obdThrottlePosition', DrivingCapabilityStatus.UNSUPPORTED)];
    const after = [row('obdThrottlePosition', DrivingCapabilityStatus.SUPPORTED)];
    const transitions = detectCapabilityTransitions(before, after);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.kind).toBe('SIGNAL_RECOVERED');
    expect(hasSignalReappeared(transitions)).toBe(true);
  });

  it('classifies provider transport errors as PROVIDER_DEGRADED not UNSUPPORTED', () => {
    const before = [row('behavior.harshBraking', DrivingCapabilityStatus.SUPPORTED)];
    const after = [
      row('behavior.harshBraking', DrivingCapabilityStatus.DEGRADED, {
        providerError: true,
        providerErrorCode: 'DIMO_503',
      }),
    ];
    const transitions = detectCapabilityTransitions(before, after);
    expect(transitions[0]?.kind).toBe('PROVIDER_DEGRADED');
    expect(transitions[0]?.nextStatus).toBe(DrivingCapabilityStatus.DEGRADED);
  });

  it('increments loss streak across repeated signal loss refreshes', () => {
    const checkedAt = new Date('2026-07-16T10:00:00Z');
    const previous = row('obdEngineLoad', DrivingCapabilityStatus.SUPPORTED, { lossStreak: 1 });

    const metadata = buildLifecycleMetadata({
      refreshTrigger: 'SIGNAL_LOSS_RETRY',
      previousRow: previous,
      nextStatus: DrivingCapabilityStatus.UNSUPPORTED,
      checkedAt,
      existingMetadata: previous.metadata as Record<string, unknown>,
    });

    expect(metadata.lossStreak).toBe(2);
    expect(shouldScheduleSignalLossRetry([{
      capabilityKey: 'obdEngineLoad',
      kind: 'SIGNAL_LOST',
      previousStatus: DrivingCapabilityStatus.SUPPORTED,
      nextStatus: DrivingCapabilityStatus.UNSUPPORTED,
      lossStreak: 2,
    }])).toBe(true);
  });

  it('resets loss streak when signal recovers', () => {
    expect(
      computeNextLossStreak(
        DrivingCapabilityStatus.UNSUPPORTED,
        DrivingCapabilityStatus.SUPPORTED,
        3,
      ),
    ).toBe(0);
  });

  it('preserves audit history without deleting previous status', () => {
    const checkedAt = new Date('2026-07-16T12:00:00Z');
    const previous = row('speed', DrivingCapabilityStatus.SUPPORTED);
    const metadata = buildLifecycleMetadata({
      refreshTrigger: 'PERIODIC_STALE',
      previousRow: previous,
      nextStatus: DrivingCapabilityStatus.LIMITED,
      checkedAt,
    });
    expect(metadata.previousStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
    expect(metadata.statusHistory?.length).toBe(1);
    expect(metadata.statusHistory?.[0]?.to).toBe(DrivingCapabilityStatus.LIMITED);
  });
});
