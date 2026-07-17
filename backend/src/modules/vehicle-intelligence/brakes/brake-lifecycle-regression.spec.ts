import {
  createBrakeLifecycleHarness,
  seedMeasuredBrakeBaseline,
} from './brake-lifecycle-test.harness';

function summaryPadHealthStillGood(current: Record<string, unknown>): boolean {
  const front = current.frontPadHealthPct;
  const rear = current.rearPadHealthPct;
  return (
    (typeof front !== 'number' || front >= 60) &&
    (typeof rear !== 'number' || rear >= 60)
  );
}

describe('Brake lifecycle regression safety net (pre-remediation)', () => {
  describe('A — Registration: spec without materialized BrakeHealthCurrent', () => {
    it('must not report successful initialization when health init fails after spec write', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 1200 });

      const initSpy = jest
        .spyOn(h.brakeHealth, 'applyScopedComponentAnchorsInTx')
        .mockRejectedValueOnce(new Error('brake_health_current persist failed'));

      const result = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 800,
        frontRotorWidth: 28,
        rearRotorWidth: 26,
      });

      initSpy.mockRestore();

      expect(h.store.vehicleBrakeReferenceSpec.length).toBeGreaterThan(0);
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);

      expect(result?.initialized).not.toBe(true);
      expect(result?.status).not.toBe('initialized');
      expect(result?.lifecycleApplied).not.toBe(true);
      expect(result?.message).toMatch(/initialization failed|not strong enough/i);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
      expect(summary.stateClass).not.toBe('MEASURED');

      const rental = h.evaluateBrakes(summary) as { state: string; evidence_type: string };
      expect(rental.state).not.toBe('good');
      expect(rental.evidence_type).not.toBe('measured');
    });

    it('must not treat reference spec alone as initialized brake health', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 5000 });

      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 11,
          rearPadThickness: 9,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'manual_registration',
        },
      });

      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
      expect(summary.overallCondition).not.toBe('GOOD');

      const rental = h.evaluateBrakes(summary) as { state: string };
      expect(rental.state).toBe('unknown');
    });
  });

  describe('B — Partial service: FRONT_PADS only', () => {
    it('must leave rear pads, discs, and unaffected k-factors unchanged', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 25000 });
      const before = await seedMeasuredBrakeBaseline(h, {
        odometerKm: 20000,
        frontPadMm: 8.2,
        rearPadMm: 7.4,
        frontDiscMm: 27.5,
        rearDiscMm: 25.8,
        kFactors: {
          frontPad: 1.12,
          rearPad: 1.08,
          frontDisc: 1.05,
          rearDisc: 1.02,
        },
      });

      await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-01T10:00:00Z',
        odometerKm: 25000,
        kind: 'pads_service',
        scope: ['front_pads'],
        measured: { frontPadMm: 11.0 },
      });

      const after = h.store.brakeHealthCurrent.get(h.vehicleId)!;

      expect(after.frontPadAnchorMm).toBe(11.0);
      expect(after.rearPadAnchorMm).toBe(before.rearPadAnchorMm);
      expect(after.frontDiscAnchorMm).toBe(before.frontDiscAnchorMm);
      expect(after.rearDiscAnchorMm).toBe(before.rearDiscAnchorMm);
      expect(after.rearPadKFactor).toBe(before.rearPadKFactor);
      expect(after.frontDiscKFactor).toBe(before.frontDiscKFactor);
      expect(after.rearDiscKFactor).toBe(before.rearDiscKFactor);
      expect(after.frontPadKFactor).toBe(before.frontPadKFactor);
    });
  });

  describe('C — Inspection: INSPECTION_ONLY', () => {
    it('must not reset component anchors when inspection records measured thickness', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 30000 });
      const before = await seedMeasuredBrakeBaseline(h, {
        odometerKm: 28000,
        frontPadMm: 6.5,
        rearPadMm: 6.1,
        frontDiscMm: 26.8,
        rearDiscMm: 24.9,
      });

      await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-15T10:00:00Z',
        odometerKm: 30000,
        kind: 'inspection_only',
        measured: { frontPadMm: 6.2, rearPadMm: 5.9 },
      });

      const after = h.store.brakeHealthCurrent.get(h.vehicleId)!;

      expect(after.frontPadAnchorMm).toBe(before.frontPadAnchorMm);
      expect(after.rearPadAnchorMm).toBe(before.rearPadAnchorMm);
      expect(after.frontDiscAnchorMm).toBe(before.frontDiscAnchorMm);
      expect(after.rearDiscAnchorMm).toBe(before.rearDiscAnchorMm);
    });
  });

  describe('D — Brake fluid service: BRAKE_FLUID_SERVICE', () => {
    it('must not reset pad/disc anchors when fluid service records measured thickness', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 42000 });
      const before = await seedMeasuredBrakeBaseline(h, {
        odometerKm: 40000,
        frontPadMm: 7.8,
        rearPadMm: 7.1,
        frontDiscMm: 27.0,
        rearDiscMm: 25.5,
      });

      await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-07-01T10:00:00Z',
        odometerKm: 42000,
        kind: 'brake_fluid_service',
        measured: { frontPadMm: 7.5, rearPadMm: 6.9 },
      });

      const after = h.store.brakeHealthCurrent.get(h.vehicleId)!;

      expect(after.frontPadAnchorMm).toBe(before.frontPadAnchorMm);
      expect(after.rearPadAnchorMm).toBe(before.rearPadAnchorMm);
      expect(after.frontDiscAnchorMm).toBe(before.frontDiscAnchorMm);
      expect(after.rearDiscAnchorMm).toBe(before.rearDiscAnchorMm);
    });
  });

  describe('E — Spec fallback without confirmed replacement', () => {
    it('must not present reference-spec fallback as measured current thickness', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 15000 });

      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 10,
          rearPadThickness: 10,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'manual_registration',
        },
      });

      await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-05-01T10:00:00Z',
        odometerKm: 15000,
        kind: 'pads_service',
        scope: ['front_pads'],
      });

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      const current = h.store.brakeHealthCurrent.get(h.vehicleId)!;

      expect(summary.dataBasis).not.toBe('MEASURED');
      expect(summary.frontDataBasis).not.toBe('MEASURED');
      expect(summary.rearDataBasis).not.toBe('MEASURED');
      expect(summary.stateClass).toBe('ESTIMATED');
      expect(current.anchorValidationStatus).toBe('spec_fallback_anchor');
      expect(h.store.brakeEvidence).toHaveLength(0);
      expect(summary.confidenceLevel).not.toBe('HIGH');
    });
  });

  describe('F — Service partial failure: event without health init', () => {
    it('must surface service-event vs health inconsistency when initialization fails', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 18000 });

      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 10,
          rearPadThickness: 9,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'test',
        },
      });

      const initSpy = jest
        .spyOn(h.brakeHealth, 'applyScopedComponentAnchorsInTx')
        .mockRejectedValueOnce(new Error('transaction rolled back'));

      const result = await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-05-20T10:00:00Z',
        odometerKm: 18000,
        kind: 'pads_service',
        measured: { frontPadMm: 8.8, rearPadMm: 8.1 },
      });

      initSpy.mockRestore();

      expect(h.store.vehicleServiceEvent).toHaveLength(1);
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
      expect(result.initialized).toBe(false);
      expect(result.lifecycleApplied).toBe(false);
      expect(result.message).toMatch(/initialization failed/i);

      const event = h.store.vehicleServiceEvent[0];
      expect(event.brakeLifecycleApplied).toBe(false);
      expect(event.brakeLifecycleNote).toMatch(/initialization failed|application failed/i);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
    });
  });

  describe('G — Evidence partial failure: health without evidence', () => {
    it('must roll back health mutation when evidence write fails atomically', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 22000 });

      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 10,
          rearPadThickness: 9,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'test',
        },
      });

      const evidenceSpy = jest
        .spyOn(h.prisma.brakeEvidence, 'create')
        .mockRejectedValueOnce(new Error('brake_evidence write failed'));

      const result = await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-05-25T10:00:00Z',
        odometerKm: 22000,
        kind: 'pads_service',
        measured: { frontPadMm: 8.6, rearPadMm: 7.9 },
        clientRequestId: 'regression-g-evidence-fail',
      });

      evidenceSpy.mockRestore();

      expect(result.initialized).toBe(false);
      expect(h.store.brakeEvidence).toHaveLength(0);
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
      expect(h.store.brakeServiceApplications.some((a) => a.status === 'FAILED')).toBe(true);
    });
  });

  describe('H — Estimated safety: pure wear estimate must not hard-block', () => {
    it('must not block rental on ESTIMATED CRITICAL without measured basis or safety alert', async () => {
      const h = createBrakeLifecycleHarness();
      const summary = {
        overallCondition: 'CRITICAL' as const,
        dataBasis: 'ESTIMATED' as const,
        stateClass: 'ESTIMATED' as const,
        openAlerts: [] as Array<{ severity: string; code: string; message: string }>,
        hasAlert: false,
      };

      const modules = {
        service_compliance: { state: 'good', reason: 'ok' },
        brakes: { state: 'critical', reason: 'Geschätzter kritischer Verschleiß' },
        tires: { state: 'good', reason: 'ok' },
        error_codes: { state: 'good', reason: 'ok' },
      };

      const reasons = h.collectBlockingReasons(modules, summary as never);
      expect(reasons.some((r) => /Bremsen:/i.test(r))).toBe(false);

      const rental = h.evaluateBrakes(summary as never) as { state: string };
      expect(rental.state).toBe('critical');
    });
  });

  describe('I — Alert semantics: coverage gap is not wear', () => {
    it('must not treat trip-impact coverage gap as pad/disc wear alert or rental escalation', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 52000 });
      await seedMeasuredBrakeBaseline(h, {
        odometerKm: 50000,
        frontPadMm: 12,
        rearPadMm: 11,
        frontDiscMm: 28,
        rearDiscMm: 26,
      });

      h.store.vehicleLatestState.set(h.vehicleId, { vehicleId: h.vehicleId, odometerKm: 52000 });
      h.store.tripDrivingImpact.push({
        vehicleId: h.vehicleId,
        tripStartedAt: '2026-02-01T10:00:00Z',
        distanceKm: 600,
        citySharePct: 40,
        highwaySharePct: 40,
        countryRoadSharePct: 20,
        hardBrakePer100Km: 3,
        fullBrakingPer100Km: 0.5,
        stopDensity: 1.0,
        highSpeedBrakeShare: 0.1,
        thermalBrakeStressScore: 30,
      });

      await h.brakeHealth.recalculate(h.vehicleId);

      const current = h.store.brakeHealthCurrent.get(h.vehicleId)!;
      expect(current.modelCoverageRatio).not.toBeNull();
      expect(current.modelCoverageRatio as number).toBeLessThan(0.6);
      expect(summaryPadHealthStillGood(current)).toBe(true);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      const wearAlerts = summary.openAlerts.filter(
        (a) =>
          (a.severity === 'warning' || a.severity === 'critical') &&
          /PAD|DISC|REMAINING/i.test(a.code),
      );

      expect(summary.overallCondition).not.toBe('CRITICAL');
      expect(wearAlerts).toHaveLength(0);
      expect(summary.hasAlert).toBe(false);

      const rental = h.evaluateBrakes(summary) as { state: string };
      expect(rental.state).not.toBe('warning');
      expect(rental.state).not.toBe('critical');

      const reasons = h.collectBlockingReasons(
        {
          service_compliance: { state: 'good', reason: 'ok' },
          brakes: { state: rental.state, reason: 'ok' },
          tires: { state: 'good', reason: 'ok' },
          error_codes: { state: 'good', reason: 'ok' },
        },
        summary,
      );
      expect(reasons.some((r) => /Bremsen:/i.test(r))).toBe(false);

      expect(current.hasAlert).toBe(false);
      expect(
        summary.provenanceWarnings.some((w) => /coverage|abdeckung/i.test(w)) ||
          summary.modelCoverage.hasGap === true,
      ).toBe(true);
    });
  });
});
