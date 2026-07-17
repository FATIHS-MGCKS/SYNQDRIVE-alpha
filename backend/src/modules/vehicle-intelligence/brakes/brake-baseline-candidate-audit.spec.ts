import {
  auditBrakeBaselineCandidates,
  auditComponentBaseline,
  auditVehicleBrakeBaseline,
  analyzeOdometerAnchor,
  buildSyntheticBrakeBaselineFixtures,
  renderBrakeBaselineAuditMarkdown,
} from './brake-baseline-candidate-audit';

describe('brake-baseline-candidate-audit', () => {
  const salt = 'test-salt';
  const fixtures = buildSyntheticBrakeBaselineFixtures();

  const findFixture = (id: string) => fixtures.find((f) => f.vehicleId === id)!;

  it('classifies exact measurement as EXACT_MEASURED', () => {
    const input = findFixture('fixture-exact-measured');
    const vehicle = auditVehicleBrakeBaseline(input, salt)!;
    const front = vehicle.components.find((c) => c.component === 'FRONT_PADS')!;
    const rear = vehicle.components.find((c) => c.component === 'REAR_PADS')!;

    expect(front.candidateClass).toBe('EXACT_MEASURED');
    expect(front.autoApplicable).toBe(true);
    expect(rear.candidateClass).toBe('EXACT_MEASURED');
    expect(front.thicknessMm).toBe(9.2);
  });

  it('classifies confirmed replacement without treating nominal as measured', () => {
    const input = findFixture('fixture-confirmed-replacement');
    const front = auditVehicleBrakeBaseline(input, salt)!.components.find(
      (c) => c.component === 'FRONT_PADS',
    )!;

    expect(front.candidateClass).toBe('CONFIRMED_REPLACEMENT');
    expect(front.autoApplicable).toBe(true);
    expect(front.recommendedAction).toBe('auto_backfill_eligible');
  });

  it('classifies spec-only reference as SPEC_ONLY and never auto-applicable', () => {
    const input = findFixture('fixture-spec-only');
    const components = auditVehicleBrakeBaseline(input, salt)!.components;

    expect(components.every((c) => c.candidateClass === 'SPEC_ONLY')).toBe(true);
    expect(components.every((c) => c.autoApplicable === false)).toBe(true);
    expect(components[0].conflicts).toContain('nominal_spec_not_measurement');
  });

  it('classifies unclear registration as REGISTRATION_ASSERTION_ONLY', () => {
    const input = findFixture('fixture-unclear-registration');
    const front = auditVehicleBrakeBaseline(input, salt)!.components.find(
      (c) => c.component === 'FRONT_PADS',
    )!;

    expect(front.candidateClass).toBe('REGISTRATION_ASSERTION_ONLY');
    expect(front.autoApplicable).toBe(false);
  });

  it('does not derive full baseline from partial service — only scoped component', () => {
    const input = findFixture('fixture-partial-service');
    const vehicle = auditVehicleBrakeBaseline(input, salt)!;
    const front = vehicle.components.find((c) => c.component === 'FRONT_PADS')!;
    const rear = vehicle.components.find((c) => c.component === 'REAR_PADS')!;

    expect(front.candidateClass).toBe('EXACT_MEASURED');
    expect(rear.candidateClass).toBe('NO_SAFE_BASELINE');
    expect(vehicle.components.filter((c) => c.candidateClass !== 'NO_SAFE_BASELINE').length).toBe(1);
  });

  it('flags conflicting measurements as CONFLICTING_DATA', () => {
    const input = findFixture('fixture-conflicting');
    const front = auditVehicleBrakeBaseline(input, salt)!.components.find(
      (c) => c.component === 'FRONT_PADS',
    )!;

    expect(front.candidateClass).toBe('CONFLICTING_DATA');
    expect(front.autoApplicable).toBe(false);
    expect(front.conflicts.some((c) => c.includes('component_measurement_spread'))).toBe(true);
  });

  it('marks missing odometer and blocks auto apply for spec-only', () => {
    const input = findFixture('fixture-no-odometer');
    const vehicle = auditVehicleBrakeBaseline(input, salt)!;

    expect(vehicle.odometerAnchor.resolvedAnchorKm).toBeNull();
    expect(vehicle.odometerAnchor.conflicts).toContain('missing_odometer_anchor');
    expect(vehicle.components[0].autoApplicable).toBe(false);
  });

  it('surfaces pending enrichment job without mutating data', () => {
    const input = findFixture('fixture-pending-job');
    const vehicle = auditVehicleBrakeBaseline(input, salt)!;

    expect(vehicle.pendingEnrichmentJobs).toBe(1);
    expect(vehicle.vehicleConflicts).toContain('pending_brake_enrichment_job');
    expect(vehicle.legacyJobClassification).toBe('ORPHAN_LEGACY_NO_PROCESSOR');
  });

  it('returns NO_SAFE_BASELINE when no evidence exists', () => {
    const input = findFixture('fixture-no-candidate');
    const vehicle = auditVehicleBrakeBaseline(input, salt)!;

    expect(vehicle.components.every((c) => c.candidateClass === 'NO_SAFE_BASELINE')).toBe(true);
  });

  it('skips vehicles that already have reliable initialized baseline', () => {
    const input = findFixture('fixture-already-initialized');
    expect(auditVehicleBrakeBaseline(input, salt)).toBeNull();
  });

  it('analyzes odometer rollbacks and spread conflicts', () => {
    const input = findFixture('fixture-exact-measured');
    const anchor = analyzeOdometerAnchor(
      {
        ...input,
        odometerSignals: [
          { odometerKm: 10000, observedAt: '2026-01-01T00:00:00.000Z', source: 'A', evidenceRef: 'a' },
          { odometerKm: 60000, observedAt: '2026-02-01T00:00:00.000Z', source: 'B', evidenceRef: 'b' },
        ],
      },
      '2026-02-01T00:00:00.000Z',
    );

    expect(anchor.conflicts.some((c) => c.includes('odometer_spread'))).toBe(true);
  });

  it('aggregates fixture report with read-only posture and anonymized ids', () => {
    const report = auditBrakeBaselineCandidates(fixtures, {
      mode: 'fixtures',
      auditSalt: salt,
    });

    expect(report.readOnly).toBe(true);
    expect(report.summary.vehiclesAudited).toBe(10);
    expect(report.summary.byCandidateClass.EXACT_MEASURED).toBeGreaterThanOrEqual(2);
    expect(report.summary.byCandidateClass.SPEC_ONLY).toBeGreaterThanOrEqual(4);
    expect(report.summary.byCandidateClass.CONFLICTING_DATA).toBeGreaterThanOrEqual(1);
    expect(report.summary.byCandidateClass.NO_SAFE_BASELINE).toBeGreaterThanOrEqual(4);

    const md = renderBrakeBaselineAuditMarkdown(report);
    expect(md).toContain('read-only audit');
    expect(md).not.toContain('fixture-exact-measured');
    expect(md).not.toContain('org-fixture-1');
  });

  it('never auto-applies SPEC_ONLY even with odometer resolved', () => {
    const input = findFixture('fixture-spec-only');
    const anchor = analyzeOdometerAnchor(input, input.referenceSpec!.createdAt);
    const result = auditComponentBaseline(input, 'FRONT_PADS', anchor);
    expect(result.candidateClass).toBe('SPEC_ONLY');
    expect(result.autoApplicable).toBe(false);
  });
});
