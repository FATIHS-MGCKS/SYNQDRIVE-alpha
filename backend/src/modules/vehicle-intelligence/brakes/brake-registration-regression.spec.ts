import { createBrakeLifecycleHarness } from './brake-lifecycle-test.harness';

function createBrakeRegistrationHarness(
  input?: Parameters<typeof createBrakeLifecycleHarness>[0],
) {
  return createBrakeLifecycleHarness(input);
}

describe('Brake registration initialization regression', () => {
  describe('register-from-dimo pipeline', () => {
    it('1) NEW + odometer + measured pad values → initialized GOOD with measured evidence', async () => {
      const h = createBrakeRegistrationHarness({ latestStateOdometerKm: 2500 });
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 1500,
        frontPadThickness: 10.5,
        rearPadThickness: 10.2,
        frontRotorWidth: 28,
        rearRotorWidth: 26,
      });

      expect(init?.initialized).toBe(true);
      const current = h.store.brakeHealthCurrent.get(h.vehicleId);
      expect(current?.isInitialized).toBe(true);
      expect(current?.anchorValidationStatus).toBe('measured_anchor');
      expect(current?.stateClass).toBe('MEASURED');

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(true);
      expect(summary.overallCondition).toBe('GOOD');
      expect(summary.dataBasis).toBe('MEASURED');

      const rental = h.evaluateBrakes(summary) as { state: string; evidence_type: string };
      expect(rental.state).toBe('good');
      expect(rental.evidence_type).toBe('measured');

      const measuredEvidence = h.store.brakeEvidence.filter((e) => e.measuredPadMm != null);
      expect(measuredEvidence.length).toBeGreaterThan(0);
      expect(measuredEvidence.every((e) => e.source === 'MANUAL_MEASUREMENT')).toBe(true);
    });

    it('2) NEW + odometer without measured mm → documented baseline, not MEASURED', async () => {
      const h = createBrakeRegistrationHarness({
        registrationMileageKm: 800,
        latestStateOdometerKm: 1200,
      });
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 800,
      });

      expect(init?.initialized).toBe(true);
      const current = h.store.brakeHealthCurrent.get(h.vehicleId);
      expect(current?.isInitialized).toBe(true);
      expect(current?.anchorValidationStatus).toBe('spec_fallback_anchor');
      expect(current?.stateClass).toBe('ESTIMATED');

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.overallCondition).toBe('GOOD');
      expect(summary.dataBasis).toBe('DOCUMENTED');
      expect(summary.stateClass).toBe('ESTIMATED');

      const rental = h.evaluateBrakes(summary) as { state: string; evidence_type: string };
      expect(rental.state).toBe('good');
      expect(rental.evidence_type).toBe('document');
      expect(rental.evidence_type).not.toBe('measured');

      expect(h.store.brakeEvidence).toHaveLength(0);
    });

    it('3) brake specs without odometer → no fake GOOD, stays NO_BASELINE', async () => {
      const h = createBrakeRegistrationHarness();
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'USED',
        frontPadThickness: 8.5,
        rearPadThickness: 7.8,
      });

      expect(init).toBeNull();
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
      expect(summary.stateClass).toBe('NO_BASELINE');
      expect(summary.overallCondition).not.toBe('GOOD');
      expect(summary.message).toMatch(/odometer|baseline/i);

      const rental = h.evaluateBrakes(summary) as { state: string; reason: string };
      expect(rental.state).toBe('unknown');
      expect(rental.state).not.toBe('good');
      expect(rental.reason).toMatch(/Baseline|belastbare/i);
    });
  });
});
