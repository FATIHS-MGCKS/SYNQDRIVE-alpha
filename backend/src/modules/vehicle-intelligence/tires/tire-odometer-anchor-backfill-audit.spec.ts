import {
  auditBackfillCandidates,
  auditSetupBackfillCandidate,
  buildSyntheticBackfillFixtures,
  renderBackfillAuditMarkdown,
} from './tire-odometer-anchor-backfill-audit';

describe('tire-odometer-anchor-backfill-audit', () => {
  const salt = 'test-salt';

  it('classifies documented install measurement as EXACT', () => {
    const fixtures = buildSyntheticBackfillFixtures();
    const exact = fixtures.find((f) => f.setupId === 'fixture-exact')!;
    const result = auditSetupBackfillCandidate(exact, salt);
    expect(result.confidence).toBe('EXACT');
    expect(result.candidateOdometerKm).toBe(45200);
    expect(result.source).toBe('DOCUMENTED_INSTALL_MEASUREMENT');
    expect(result.rejectedRetroactiveInference).toBe(true);
  });

  it('classifies DIMO historical near install as HIGH_CONFIDENCE', () => {
    const dimo = buildSyntheticBackfillFixtures().find((f) => f.setupId === 'fixture-dimo-high')!;
    const result = auditSetupBackfillCandidate(dimo, salt);
    expect(result.confidence).toBe('HIGH_CONFIDENCE');
    expect(result.source).toBe('DIMO_HISTORICAL');
  });

  it('classifies HM historical near install as HIGH_CONFIDENCE', () => {
    const hm = buildSyntheticBackfillFixtures().find((f) => f.setupId === 'fixture-hm-high')!;
    const result = auditSetupBackfillCandidate(hm, salt);
    expect(result.confidence).toBe('HIGH_CONFIDENCE');
    expect(result.source).toBe('HIGH_MOBILITY_HISTORICAL');
  });

  it('classifies handover within medium window as MEDIUM_CONFIDENCE', () => {
    const handover = buildSyntheticBackfillFixtures().find(
      (f) => f.setupId === 'fixture-medium-handover',
    )!;
    const result = auditSetupBackfillCandidate(handover, salt);
    expect(result.confidence).toBe('MEDIUM_CONFIDENCE');
    expect(result.source).toBe('HANDOVER_PROTOCOL');
  });

  it('classifies distant trip boundary as LOW_CONFIDENCE', () => {
    const trip = buildSyntheticBackfillFixtures().find((f) => f.setupId === 'fixture-low-trip')!;
    const result = auditSetupBackfillCandidate(trip, salt);
    expect(result.confidence).toBe('LOW_CONFIDENCE');
    expect(result.source).toBe('TRIP_ODOMETER_BOUNDARY');
    expect(result.conflicts).toEqual(
      expect.arrayContaining(['trips_already_recorded_on_setup_after_delayed_anchor']),
    );
  });

  it('returns NO_SAFE_CANDIDATE when no evidence exists', () => {
    const none = buildSyntheticBackfillFixtures().find((f) => f.setupId === 'fixture-none')!;
    const result = auditSetupBackfillCandidate(none, salt);
    expect(result.confidence).toBe('NO_SAFE_CANDIDATE');
    expect(result.candidateOdometerKm).toBeNull();
  });

  it('flags CONFLICTING_DATA when DIMO and HM disagree beyond tolerance', () => {
    const conflict = buildSyntheticBackfillFixtures().find(
      (f) => f.setupId === 'fixture-conflict',
    )!;
    const result = auditSetupBackfillCandidate(conflict, salt);
    expect(result.confidence).toBe('CONFLICTING_DATA');
    expect(result.conflicts.some((c) => c.includes('candidate_spread'))).toBe(true);
  });

  it('downgrades rollback readings and keeps audit read-only posture', () => {
    const rollback = buildSyntheticBackfillFixtures().find(
      (f) => f.setupId === 'fixture-rollback',
    )!;
    const result = auditSetupBackfillCandidate(rollback, salt);
    expect(result.conflicts).toContain('odometer_rollback_vs_prior_vehicle_anchor');
    expect(result.confidence).toBe('LOW_CONFIDENCE');
  });

  it('anonymizes setup ids without exposing raw uuid', () => {
    const none = buildSyntheticBackfillFixtures().find((f) => f.setupId === 'fixture-none')!;
    const result = auditSetupBackfillCandidate(none, salt);
    expect(result.anonymizedSetupId).toMatch(/^setup_[a-f0-9]{12}$/);
    expect(result.anonymizedSetupId).not.toContain('fixture-none');
  });

  it('aggregates fixture report with all confidence classes represented', () => {
    const report = auditBackfillCandidates(buildSyntheticBackfillFixtures(), {
      mode: 'fixtures',
      auditSalt: salt,
    });
    expect(report.readOnly).toBe(true);
    expect(report.summary.setupsAudited).toBe(8);
    expect(report.summary.byConfidence.EXACT).toBeGreaterThanOrEqual(1);
    expect(report.summary.byConfidence.HIGH_CONFIDENCE).toBeGreaterThanOrEqual(2);
    expect(report.summary.byConfidence.MEDIUM_CONFIDENCE).toBeGreaterThanOrEqual(1);
    expect(report.summary.byConfidence.LOW_CONFIDENCE).toBeGreaterThanOrEqual(1);
    expect(report.summary.byConfidence.NO_SAFE_CANDIDATE).toBeGreaterThanOrEqual(1);
    expect(report.summary.byConfidence.CONFLICTING_DATA).toBeGreaterThanOrEqual(1);

    const md = renderBackfillAuditMarkdown(report);
    expect(md).toContain('Read-only audit');
    expect(md).not.toContain('fixture-exact');
  });

  it('skips setups that already have a traceable anchor', () => {
    const anchored = {
      ...buildSyntheticBackfillFixtures()[0],
      setupId: 'already-anchored',
      installedOdometerKm: 1000,
      odometerAnchorStatus: 'ANCHORED',
    };
    const report = auditBackfillCandidates([anchored], { mode: 'fixtures', auditSalt: salt });
    expect(report.summary.setupsAudited).toBe(0);
  });
});
