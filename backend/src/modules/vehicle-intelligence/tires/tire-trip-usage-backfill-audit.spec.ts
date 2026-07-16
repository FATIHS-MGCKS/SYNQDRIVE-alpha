import {
  auditTripBackfillCandidate,
  auditTripUsageBackfill,
  buildSetupKmRollups,
  buildSyntheticTripUsageBackfillFixtures,
  buildSyntheticTripUsageBackfillReport,
  classifyTripUsageBackfillAttribution,
  renderTripUsageBackfillAuditMarkdown,
  sumWaypointPlausibilityKm,
} from './tire-trip-usage-backfill-audit';

describe('tire-trip-usage-backfill-audit', () => {
  const salt = 'test-salt-fixtures';

  function fixture(id: string) {
    const row = buildSyntheticTripUsageBackfillFixtures().find((f) => f.tripId === id);
    if (!row) throw new Error(`missing fixture ${id}`);
    return row;
  }

  it('classifies single-setup attribution', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-single'), salt);
    expect(result.attributionClass).toBe('SINGLE_SETUP');
    expect(result.eligibleForLedger).toBe(true);
    expect(result.attributableKm).toBe(42);
    expect(result.distance.odometerConflict).toBe(false);
    expect(result.anonymizedTripId).toMatch(/^trip_[a-f0-9]{12}$/);
    expect(result.anonymizedTripId).not.toContain('fixture-single');
  });

  it('classifies no setup match', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-no-setup'), salt);
    expect(result.attributionClass).toBe('NO_SETUP');
    expect(result.eligibleForLedger).toBe(false);
    expect(result.recommendedAction).toBe('skip_not_eligible_for_ledger');
  });

  it('flags setup conflict without auto-guessing', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-conflict-multi'), salt);
    expect(result.attributionClass).toBe('SETUP_CHANGE_IN_TRIP');
    expect(result.eligibleForLedger).toBe(false);
    expect(result.conflictSetupIds.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendedAction).toBe('manual_review_required_do_not_auto_attribute');
  });

  it('flags overlapping trip spanning setup boundary', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-boundary-overlap'), salt);
    expect(['SETUP_CHANGE_IN_TRIP', 'MULTIPLE_SETUPS']).toContain(result.attributionClass);
    expect(result.eligibleForLedger).toBe(false);
  });

  it('detects reprocessed trip with existing ledger fingerprint drift', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-reprocessed'), salt);
    expect(result.attributionClass).toBe('SINGLE_SETUP');
    expect(result.reprocessingPattern).toBe('LEDGER_EXISTS_WOULD_REVISE');
    expect(result.recommendedAction).toBe('controlled_replay_would_revise_ledger');
  });

  it('flags odometer conflict against authoritative trip distance', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-odometer-conflict'), salt);
    expect(result.distance.odometerConflict).toBe(true);
    expect(result.distance.authoritativeKm).toBe(50);
    expect(result.distance.odometerDeltaKm).toBe(10);
    expect(result.recommendedAction).toBe('resolve_odometer_distance_conflict_before_apply');
  });

  it('attributes trip to stored setup via historical mount period', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-stored-setup'), salt);
    expect(result.attributionClass).toBe('SINGLE_SETUP');
    expect(result.attributedSetupStatus).toBe('STORED');
    expect(result.eligibleForLedger).toBe(true);
    expect(result.attributableKm).toBe(22);
  });

  it('classifies trip before first setup activation', () => {
    const classified = classifyTripUsageBackfillAttribution(fixture('fixture-before-first-setup'));
    expect(classified.attributionClass).toBe('TRIP_BEFORE_FIRST_SETUP');
  });

  it('classifies incomplete mount history', () => {
    const result = auditTripBackfillCandidate(fixture('fixture-incomplete-history'), salt);
    expect(result.attributionClass).toBe('INCOMPLETE_HISTORY');
    expect(result.recommendedAction).toBe('repair_mount_period_history_before_backfill');
  });

  it('computes waypoint plausibility without adding to totals', () => {
    const km = sumWaypointPlausibilityKm([
      { latitude: 52.52, longitude: 13.405 },
      { latitude: 52.53, longitude: 13.42 },
      { latitude: 52.54, longitude: 13.44 },
    ]);
    expect(km).toBeGreaterThan(0);
    const trip = auditTripBackfillCandidate(fixture('fixture-single'), salt);
    expect(trip.attributableKm).toBe(trip.distance.authoritativeKm);
    expect(trip.distance.plausibilityOnly).toBe(true);
  });

  it('builds setup km rollups with absolute and percent deviation', () => {
    const fixtures = buildSyntheticTripUsageBackfillFixtures();
    const trips = fixtures.map((f) => auditTripBackfillCandidate(f, salt));
    const rollups = buildSetupKmRollups({
      trips,
      setups: [
        {
          setupId: 'fixture-setup-active',
          vehicleId: 'fixture-vehicle-1',
          status: 'ACTIVE',
          totalKmOnSet: 80,
          existingLedgerKm: 40,
        },
      ],
      auditSalt: salt,
    });
    const active = rollups.find((r) => r.setupId === 'fixture-setup-active');
    expect(active?.expectedKmFromBackfill).toBeGreaterThan(0);
    expect(active?.absoluteDeltaKm).toBeGreaterThan(0);
    expect(active?.hasKmDeviation).toBe(true);
  });

  it('aggregates fixture report as read-only dry-run', () => {
    const report = buildSyntheticTripUsageBackfillReport(salt);
    expect(report.readOnly).toBe(true);
    expect(report.mode).toBe('fixtures');
    expect(report.summary.tripsScanned).toBeGreaterThanOrEqual(8);
    expect(report.summary.singleSetupAttribution).toBeGreaterThanOrEqual(2);
    expect(report.summary.conflicts).toBeGreaterThanOrEqual(1);
    expect(report.summary.odometerConflicts).toBeGreaterThanOrEqual(1);

    const md = renderTripUsageBackfillAuditMarkdown(report);
    expect(md).toContain('read-only');
    expect(md).not.toContain('fixture-single');
    expect(md).not.toContain('fixture-vehicle');
  });

  it('produces anonymized audit via auditTripUsageBackfill', () => {
    const fixtures = buildSyntheticTripUsageBackfillFixtures();
    const report = auditTripUsageBackfill(fixtures, {
      mode: 'fixtures',
      auditSalt: salt,
      filters: {
        organizationId: null,
        vehicleId: null,
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-07-16T00:00:00.000Z',
        batchSize: 50,
        fullSetupHistory: true,
        lookbackDays: 60,
      },
    });
    expect(report.summary.potentialDuplicates).toBe(0);
    expect(report.trips.every((t) => !t.anonymizedTripId.includes('fixture'))).toBe(true);
  });
});
