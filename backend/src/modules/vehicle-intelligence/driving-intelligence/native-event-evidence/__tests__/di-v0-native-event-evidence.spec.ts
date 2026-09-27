import { computeDiV0TripIntervals } from '../../core/compute-trip-intervals';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { presentObs } from '../../core/__tests__/test-helpers';
import { acquireDiV0NativeEventEvidence, toDiV0S1NativeEventInput } from '../di-v0-native-event-acquisition';
import { computeDiV0CombinedInputEvidenceVersion } from '../../evidence-input/di-v0-combined-input-identity';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

describe('S3B native event evidence', () => {
  it('zero events → NO_EVENT (not failure)', () => {
    const result = acquireDiV0NativeEventEvidence({
      vehicleId: 'v1',
      sourceFamily: 'RUPTELA_R1',
      records: [],
    });
    expect(result.status).toBe('NO_EVENT');
    expect(result.events).toHaveLength(0);
  });

  it('UNCALIBRATED native events capped at L1', () => {
    const result = acquireDiV0NativeEventEvidence({
      vehicleId: 'v1',
      sourceFamily: 'RUPTELA_R1',
      records: [
        {
          id: 'evt-brake-1',
          providerEventName: 'harshBraking',
          providerTimestamp: '2026-01-01T00:00:05Z',
          sourceFamily: 'RUPTELA_R1',
        },
        {
          id: 'evt-accel-1',
          providerEventName: 'harshAcceleration',
          providerTimestamp: '2026-01-01T00:00:06Z',
          sourceFamily: 'RUPTELA_R1',
        },
        {
          id: 'evt-unknown-1',
          providerEventName: 'vendor.custom.foo',
          providerTimestamp: '2026-01-01T00:00:07Z',
          sourceFamily: 'RUPTELA_R1',
        },
      ],
    });
    expect(result.status).toBe('EVENTS_PRESENT');
    expect(result.events.every((e) => e.calibrationState === 'UNCALIBRATED')).toBe(true);
    expect(result.events.every((e) => e.maxClaimLevel === 'L1')).toBe(true);
    expect(result.events.find((e) => e.eventId === 'evt-unknown-1')?.normalizedEventType).toBe(
      'UNKNOWN_NATIVE_EVENT',
    );
  });

  it('native events cannot override L3 interval claim', () => {
    const native = toDiV0S1NativeEventInput(
      acquireDiV0NativeEventEvidence({
        vehicleId: 'v1',
        sourceFamily: 'RUPTELA_R1',
        records: [
          {
            id: 'evt-brake-1',
            providerEventName: 'extremeBraking',
            providerTimestamp: '2026-09-26T09:57:20Z',
            sourceFamily: 'RUPTELA_R1',
          },
        ],
      }),
    );
    const positions = [
      presentObs('2026-09-26T09:57:19Z', 52, 9),
      presentObs('2026-09-26T09:57:20Z', 52.0002, 9),
      presentObs('2026-09-26T09:57:21Z', 52.0004, 9),
      presentObs('2026-09-26T09:57:22Z', 52.0006, 9),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions, nativeEvents: native }, ctx);
    expect(out.intervals.every((i) => i.claimLevel !== 'L3')).toBe(true);
  });

  it('native channel separate from R1 OBD provenance', () => {
    const native = acquireDiV0NativeEventEvidence({
      vehicleId: 'v1',
      sourceFamily: 'RUPTELA_R1',
      records: [
        {
          id: 'evt-1',
          providerEventName: 'harshBraking',
          providerTimestamp: '2026-01-01T00:00:01Z',
          sourceFamily: 'RUPTELA_R1',
        },
      ],
    });
    expect(native.events[0].observation.provenance.derivedFrom).not.toContain('INTERVAL_ONLY');
    expect(native.events[0].evidenceKind).toBe('NATIVE_EVENT_OBSERVATION');
  });

  it('snapshot determinism', () => {
    const input = {
      vehicleId: 'v1',
      sourceFamily: 'RUPTELA_R1' as const,
      records: [
        {
          id: 'evt-1',
          providerEventName: 'harshBraking',
          providerTimestamp: '2026-01-01T00:00:01Z',
          sourceFamily: 'RUPTELA_R1' as const,
        },
      ],
    };
    const a = acquireDiV0NativeEventEvidence(input);
    const b = acquireDiV0NativeEventEvidence(input);
    expect(a.snapshotIdentity.digest).toBe(b.snapshotIdentity.digest);
    const combined = computeDiV0CombinedInputEvidenceVersion([
      { channel: 'NATIVE_EVENT', inputEvidenceVersion: a.snapshotIdentity.inputEvidenceVersion },
    ]);
    expect(combined).toContain('sha256');
  });
});
