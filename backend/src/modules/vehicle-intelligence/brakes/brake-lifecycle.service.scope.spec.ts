import {
  createBrakeLifecycleHarness,
  seedMeasuredBrakeBaseline,
} from './brake-lifecycle-test.harness';

describe('BrakeLifecycleService scoped service matrix', () => {
  it('preserves unaffected alerts after partial front pad service', async () => {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 30000 });
    await seedMeasuredBrakeBaseline(h, {
      odometerKm: 25000,
      frontPadMm: 4.5,
      rearPadMm: 9,
      frontDiscMm: 28,
      rearDiscMm: 26,
    });
    const before = h.store.brakeHealthCurrent.get(h.vehicleId)!;
    h.store.brakeHealthCurrent.set(h.vehicleId, { ...before, hasAlert: true });

    await h.lifecycle.recordService({
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-02T10:00:00Z',
      odometerKm: 30000,
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 11 },
    });

    const after = h.store.brakeHealthCurrent.get(h.vehicleId)!;
    expect(after.hasAlert).toBe(true);
    expect(after.rearPadAnchorMm).toBe(before.rearPadAnchorMm);
  });

  it('records inspection measurements as evidence without changing anchors', async () => {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 32000 });
    const before = await seedMeasuredBrakeBaseline(h, {
      odometerKm: 30000,
      frontPadMm: 7,
      rearPadMm: 6.5,
    });

    await h.lifecycle.recordService({
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-03T10:00:00Z',
      odometerKm: 32000,
      kind: 'inspection_only',
      measured: { frontPadMm: 6.8, rearPadMm: 6.2 },
    });

    const after = h.store.brakeHealthCurrent.get(h.vehicleId)!;
    expect(after.frontPadAnchorMm).toBe(before.frontPadAnchorMm);
    expect(h.store.brakeEvidence.length).toBeGreaterThan(2);
  });

  it('rejects contradictory thickness for scoped pads service', async () => {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 10000 });
    const result = await h.lifecycle.recordService({
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-04T10:00:00Z',
      odometerKm: 10000,
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 10, rearPadMm: 9 },
      clientRequestId: 'scope-spec-thickness-mismatch',
    });
    expect(result.initialized).toBe(false);
    expect(result.message).toMatch(/thickness_outside_scope|initialization failed/i);
  });

  it('rejects full service without explicit scope', async () => {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 10000 });
    const result = await h.lifecycle.recordService({
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-05T10:00:00Z',
      odometerKm: 10000,
      kind: 'full_brake_service',
      clientRequestId: 'scope-spec-full-service-reject',
    });
    expect(result.initialized).toBe(false);
    expect(result.message).toMatch(/full_service_requires_explicit_scope|initialization failed/i);
  });
});
