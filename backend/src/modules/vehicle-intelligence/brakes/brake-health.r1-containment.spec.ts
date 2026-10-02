import {
  createBrakeLifecycleHarness,
  seedMeasuredBrakeBaseline,
} from './brake-lifecycle-test.harness';

/**
 * EXP-021 C0.3 — R1 HF FULL_BRAKING must not contribute to brake-wear conclusions.
 * Same trip-impact inputs; only the DIMO device identity differs.
 */
describe('Brake wear model — R1 temporal containment', () => {
  const R1_RAW_JSON = { aftermarketDevice: { serial: 'R1-TEST-0001' }, syntheticDevice: null };
  const TESLA_RAW_JSON = { aftermarketDevice: null, syntheticDevice: { tokenId: 7 } };

  async function padHealthAfterTrip(rawJson: unknown, fullBrakingPer100Km: number) {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 30_000 });
    h.store.vehicles.set(h.vehicleId, {
      ...h.store.vehicles.get(h.vehicleId)!,
      dimoVehicle: { rawJson },
    });
    await seedMeasuredBrakeBaseline(h, { odometerKm: 10_000 });
    h.store.vehicleLatestState.set(h.vehicleId, { vehicleId: h.vehicleId, odometerKm: 30_000 });
    h.store.tripDrivingImpact.push({
      vehicleId: h.vehicleId,
      tripId: 'trip-1',
      tripStartedAt: '2026-02-01T10:00:00Z',
      analysisStatus: 'COMPLETE',
      distanceKm: 20_000,
      citySharePct: 40,
      highwaySharePct: 40,
      countryRoadSharePct: 20,
      hardBrakePer100Km: 3,
      fullBrakingPer100Km,
      stopDensity: 1.0,
      highSpeedBrakeShare: 0.1,
      thermalBrakeStressScore: 30,
    });
    await h.brakeHealth.recalculate(h.vehicleId);
    const current = h.store.brakeHealthCurrent.get(h.vehicleId)!;
    return current.frontPadHealthPct as number;
  }

  it('R1 FULL_BRAKING rate does not accelerate modeled pad wear', async () => {
    const r1Heavy = await padHealthAfterTrip(R1_RAW_JSON, 20);
    const r1None = await padHealthAfterTrip(R1_RAW_JSON, 0);
    expect(typeof r1Heavy).toBe('number');
    expect(r1Heavy).toBe(r1None);
  });

  it('Tesla (API synthetic) FULL_BRAKING rate still accelerates modeled pad wear', async () => {
    const teslaHeavy = await padHealthAfterTrip(TESLA_RAW_JSON, 20);
    const teslaNone = await padHealthAfterTrip(TESLA_RAW_JSON, 0);
    expect(teslaHeavy).toBeLessThan(teslaNone);
  });

  it('R1 scheduled recalculation is deterministic when contained full-braking input is unchanged', async () => {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 30_000 });
    h.store.vehicles.set(h.vehicleId, {
      ...h.store.vehicles.get(h.vehicleId)!,
      dimoVehicle: { rawJson: R1_RAW_JSON },
    });
    await seedMeasuredBrakeBaseline(h, { odometerKm: 10_000 });
    h.store.vehicleLatestState.set(h.vehicleId, { vehicleId: h.vehicleId, odometerKm: 30_000 });
    h.store.tripDrivingImpact.push({
      vehicleId: h.vehicleId,
      tripId: 'trip-1',
      tripStartedAt: '2026-02-01T10:00:00Z',
      analysisStatus: 'COMPLETE',
      distanceKm: 20_000,
      citySharePct: 40,
      highwaySharePct: 40,
      countryRoadSharePct: 20,
      hardBrakePer100Km: 3,
      fullBrakingPer100Km: 15,
      stopDensity: 1.0,
      highSpeedBrakeShare: 0.1,
      thermalBrakeStressScore: 30,
    });
    const first = await h.brakeHealth.recalculate(h.vehicleId);
    const second = await h.brakeHealth.recalculate(h.vehicleId);
    expect(second?.skipReason).toBe('identical_input_fingerprint');
    expect(first?.inputFingerprint).toBe(second?.inputFingerprint);
  });
});
