import {
  buildShutdownEvidenceObservationIdempotencyKey,
  buildTripShutdownContextIdempotencyKey,
} from './shutdown-evidence-idempotency.policy';

describe('shutdown evidence idempotency', () => {
  it('derives stable key from source observation id', () => {
    const a = buildShutdownEvidenceObservationIdempotencyKey({
      vehicleId: 'veh-1',
      provider: 'DIMO',
      providerObservationAtMs: 1_000,
      sourceKind: 'LIVE_VOLTAGE_CLASSIFY',
      sourceObservationId: 'battery-obs:abc',
      voltage: 12.15,
    });
    const b = buildShutdownEvidenceObservationIdempotencyKey({
      vehicleId: 'veh-1',
      provider: 'DIMO',
      providerObservationAtMs: 2_000,
      sourceKind: 'LIVE_VOLTAGE_CLASSIFY',
      sourceObservationId: 'battery-obs:abc',
      voltage: 12.15,
    });
    expect(a).toBe(b);
    expect(a).toBe('shutdown-ev:veh-1:battery-obs:abc');
  });

  it('derives deterministic fallback key without source observation id', () => {
    const key = buildShutdownEvidenceObservationIdempotencyKey({
      vehicleId: 'veh-1',
      provider: 'DIMO',
      providerObservationAtMs: 1_720_000_000_000,
      sourceKind: 'LIVE_VOLTAGE_CLASSIFY',
      voltage: 12.15,
    });
    expect(key).toBe(
      'shutdown-ev:veh-1:DIMO:LIVE_VOLTAGE_CLASSIFY:1720000000000:12.150',
    );
  });

  it('uses one logical trip context key per trip', () => {
    expect(
      buildTripShutdownContextIdempotencyKey({
        vehicleId: 'veh-1',
        tripId: 'trip-1',
      }),
    ).toBe('shutdown-ctx:veh-1:trip-1');
  });
});
