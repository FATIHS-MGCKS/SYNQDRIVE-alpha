import {
  buildGeneralizedEvidenceIdempotencyKey,
  buildRestSessionOpenIdempotencyKey,
} from './generalized-evidence-idempotency.policy';

describe('generalized evidence idempotency (K/P multi-replica)', () => {
  it('uses stable evidence key per vehicle + source measurement', () => {
    const a = buildGeneralizedEvidenceIdempotencyKey({
      vehicleId: 'veh-1',
      sourceMeasurementId: 'meas-1',
    });
    const b = buildGeneralizedEvidenceIdempotencyKey({
      vehicleId: 'veh-1',
      sourceMeasurementId: 'meas-1',
    });
    expect(a).toBe(b);
    expect(a).toBe('gen-ev:veh-1:meas-1');
  });

  it('uses stable rest session open key per vehicle + anchor ms', () => {
    const key = buildRestSessionOpenIdempotencyKey({
      vehicleId: 'veh-1',
      anchorAtMs: 1_728_000_000_000,
    });
    expect(key).toBe('rest-session:veh-1:1728000000000');
  });
});
