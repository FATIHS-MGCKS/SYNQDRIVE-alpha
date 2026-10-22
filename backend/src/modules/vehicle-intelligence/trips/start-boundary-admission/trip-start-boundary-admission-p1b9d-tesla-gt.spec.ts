import {
  P1B9D_FIXTURE_PROVENANCE,
  P1B9D_TESLA_FIXTURES,
  P1B9D_TESLA_TRIP_1,
  trip1CoreWithoutWeakSpeedEvidence,
  trip1RouteWithoutWeakSpeedEvidence,
  type P1b9dTeslaGroundTruthFixture,
} from './fixtures/p1b9d-tesla-oct21-ground-truth.fixture';
import { compareStartBoundaryAdmissionShadow } from './trip-start-boundary-admission.shadow';
import { resolveEvidenceBackedStartBoundary } from './trip-start-boundary-admission.resolver';
import { resolveLegacyConfirmedStartBoundary } from './trip-start-boundary-legacy-resolution';
import { findEarliestTrustedMovementInWindow } from './trip-start-boundary-admission.movement';

const MAX_P1B_GT_ABS_DELTA_MS = 15_000;

function offlineEvaluate(fixture: P1b9dTeslaGroundTruthFixture) {
  const candidateStartAt = new Date(fixture.candidateStartAtUtc);
  const confirmedAt = new Date(fixture.confirmedAtUtc);
  const gtStartMs = new Date(fixture.groundTruthStartUtc).getTime();

  const legacy = resolveLegacyConfirmedStartBoundary({
    boundaryWindowFrom: new Date(fixture.legacyCanonicalStartUtc),
    candidateStartAt,
    confirmedAt,
    corePoints: fixture.corePoints,
    profile: fixture.profile,
    segments: fixture.segments,
    routePoints: fixture.routePoints,
    legacyRouteFetchPerformed: true,
  });

  const shadow = compareStartBoundaryAdmissionShadow({
    candidateStartAt,
    confirmedAt,
    segments: fixture.segments,
    corePoints: fixture.corePoints,
    routePoints: fixture.routePoints,
    profile: fixture.profile,
    integrationModality: fixture.integrationModality,
  });

  const proposed = resolveEvidenceBackedStartBoundary({
    candidateStartAt,
    confirmedAt,
    segments: fixture.segments,
    corePoints: fixture.corePoints,
    routePoints: fixture.routePoints,
    profile: fixture.profile,
    integrationModality: fixture.integrationModality,
  });

  const prefixMovement = findEarliestTrustedMovementInWindow(
    new Date(fixture.legacyCanonicalStartUtc),
    candidateStartAt,
    fixture.corePoints,
    fixture.routePoints,
    fixture.profile,
  );

  const p1bDeltaMs = proposed.canonicalStartAt.getTime() - gtStartMs;
  const legacyDeltaMs =
    legacy.legacy.startAt.getTime() - gtStartMs;

  return {
    legacy,
    shadow,
    proposed,
    prefixMovement,
    p1bDeltaMs,
    legacyDeltaMs,
  };
}

describe('P1B.9D — Tesla Oct 21 ground-truth start boundary (offline)', () => {
  it.each(P1B9D_TESLA_FIXTURES.map((f) => [f.label, f] as const))(
    '%s — legacy writer path still uses DIMO segment (not movement GT)',
    (_label, fixture) => {
      const { legacy } = offlineEvaluate(fixture);
      expect(legacy.legacy.source).toBe('DIMO_SEGMENT');
      expect(legacy.legacy.startAt.toISOString()).toBe(
        fixture.legacyCanonicalStartUtc,
      );
      expect(legacy.legacy.startAt.getTime()).toBeLessThan(
        new Date(fixture.groundTruthStartUtc).getTime(),
      );
    },
  );

  it.each(P1B9D_TESLA_FIXTURES.map((f) => [f.label, f] as const))(
    '%s — DIMO segment start is not treated as physical movement',
    (_label, fixture) => {
      const movementOnly = findEarliestTrustedMovementInWindow(
        new Date(fixture.legacyCanonicalStartUtc),
        new Date(fixture.confirmedAtUtc),
        fixture.corePoints,
        fixture.routePoints,
        fixture.profile,
      );
      expect(movementOnly.at).not.toBeNull();
      expect(movementOnly.at!.getTime()).toBeGreaterThan(
        new Date(fixture.legacyCanonicalStartUtc).getTime(),
      );
      expect(movementOnly.sources).not.toContain('SEGMENT_DISTANCE');
    },
  );

  it.each(P1B9D_TESLA_FIXTURES.map((f) => [f.label, f] as const))(
    '%s — existing BOUNDING policy proposes start near driver GT',
    (_label, fixture) => {
      const { proposed, p1bDeltaMs, legacyDeltaMs } = offlineEvaluate(fixture);

      expect(['PROVIDER_START_BOUNDED', 'MOVEMENT_BOUNDARY_SELECTED']).toContain(
        proposed.decision,
      );
      expect(proposed.provenance.movementEvidenceCoverage).toBe(
        'TRUSTED_MOVEMENT_PRESENT',
      );
      expect(Math.abs(p1bDeltaMs)).toBeLessThanOrEqual(MAX_P1B_GT_ABS_DELTA_MS);
      expect(Math.abs(p1bDeltaMs)).toBeLessThan(Math.abs(legacyDeltaMs));
      expect(proposed.canonicalStartAt.getTime()).toBeGreaterThan(
        new Date(fixture.legacyCanonicalStartUtc).getTime(),
      );
    },
  );

  it.each(P1B9D_TESLA_FIXTURES.map((f) => [f.label, f] as const))(
    '%s — shadow compares bounded movement to legacy segment',
    (_label, fixture) => {
      const { shadow, proposed } = offlineEvaluate(fixture);
      expect(shadow.proposedCanonicalStartAt).toEqual(proposed.canonicalStartAt);
      expect(shadow.legacyCanonicalStartAt.toISOString()).toBe(
        fixture.legacyCanonicalStartUtc,
      );
      expect(['PROVIDER_START_BOUNDED', 'MOVEMENT_BOUNDARY_SELECTED']).toContain(
        shadow.decision,
      );
      expect(Math.abs(shadow.deltaMs)).toBeGreaterThan(200_000);
    },
  );

  it('does not invent movement when core/route window is empty (UNKNOWN coverage)', () => {
    const fixture = P1B9D_TESLA_TRIP_1;
    const proposed = resolveEvidenceBackedStartBoundary({
      candidateStartAt: new Date(fixture.candidateStartAtUtc),
      confirmedAt: new Date(fixture.confirmedAtUtc),
      segments: fixture.segments,
      corePoints: [],
      routePoints: [],
      profile: fixture.profile,
      integrationModality: fixture.integrationModality,
    });
    expect(proposed.decision).toBe('PROVIDER_START_UNCORROBORATED');
    expect(proposed.provenance.movementEvidenceCoverage).not.toBe(
      'TRUSTED_MOVEMENT_PRESENT',
    );
    expect(proposed.canonicalStartAt).toEqual(
      new Date(fixture.candidateStartAtUtc),
    );
  });

  describe('fixture provenance (offline only — not live shadow proof)', () => {
    it('documents archived vs constructed fields', () => {
      expect(P1B9D_FIXTURE_PROVENANCE.archivedFromProduction.length).toBeGreaterThan(
        0,
      );
      expect(P1B9D_FIXTURE_PROVENANCE.constructedForOfflineReplay).toContain(
        'candidateStartAtUtc (POSSIBLE_START_VALIDATION run; not on trip row)',
      );
      expect(P1B9D_FIXTURE_PROVENANCE.notClaimed[0]).toMatch(/live P1B shadow/);
    });
  });

  describe('TESLA_GT_TRIP_1 — weak speed robustness (EV 0.5 km/h threshold)', () => {
    const gtMs = new Date(P1B9D_TESLA_TRIP_1.groundTruthStartUtc).getTime();

    function proposeWith(
      corePoints: P1b9dTeslaGroundTruthFixture['corePoints'],
      routePoints: P1b9dTeslaGroundTruthFixture['routePoints'],
    ) {
      return resolveEvidenceBackedStartBoundary({
        candidateStartAt: new Date(P1B9D_TESLA_TRIP_1.candidateStartAtUtc),
        confirmedAt: new Date(P1B9D_TESLA_TRIP_1.confirmedAtUtc),
        segments: P1B9D_TESLA_TRIP_1.segments,
        corePoints,
        routePoints,
        profile: P1B9D_TESLA_TRIP_1.profile,
        integrationModality: P1B9D_TESLA_TRIP_1.integrationModality,
      });
    }

    it('baseline uses 12:03:08Z ROUTE_SPEED=1 km/h (margin above 0.5 km/h)', () => {
      const baseline = proposeWith(
        P1B9D_TESLA_TRIP_1.corePoints,
        P1B9D_TESLA_TRIP_1.routePoints,
      );
      expect(baseline.canonicalStartAt.toISOString()).toBe(
        '2026-10-21T12:03:08.000Z',
      );
      expect(baseline.provenance.movementEvidenceSources).toContain(
        'ROUTE_SPEED',
      );
    });

    it('without weak route speed, core HF sample at 12:03:11Z still bounds near GT', () => {
      const routes = trip1RouteWithoutWeakSpeedEvidence();
      const proposed = proposeWith(P1B9D_TESLA_TRIP_1.corePoints, routes);
      expect(proposed.canonicalStartAt.toISOString()).toBe(
        '2026-10-21T12:03:11.000Z',
      );
      expect(proposed.provenance.movementEvidenceSources).toContain(
        'CORE_SPEED',
      );
      expect(Math.abs(proposed.canonicalStartAt.getTime() - gtMs)).toBeLessThanOrEqual(
        MAX_P1B_GT_ABS_DELTA_MS,
      );
    });

    it('without weak route and core speed=1, stronger samples still bound near GT', () => {
      const routes = trip1RouteWithoutWeakSpeedEvidence();
      const core = trip1CoreWithoutWeakSpeedEvidence();
      const proposed = proposeWith(core, routes);
      expect(proposed.canonicalStartAt.toISOString()).toBe(
        '2026-10-21T12:03:29.000Z',
      );
      expect(['ROUTE_SPEED', 'CORE_SPEED']).toContain(
        proposed.provenance.movementEvidenceSources[0],
      );
      expect(Math.abs(proposed.canonicalStartAt.getTime() - gtMs)).toBeLessThanOrEqual(
        MAX_P1B_GT_ABS_DELTA_MS,
      );
      expect(
        Math.abs(proposed.canonicalStartAt.getTime() - gtMs),
      ).toBeLessThan(Math.abs(new Date('2026-10-21T11:58:00.000Z').getTime() - gtMs));
    });
  });

  it('P1B fallback remains candidate when movement cannot be corroborated', () => {
    const fixture = P1B9D_TESLA_TRIP_1;
    const candidate = new Date(fixture.candidateStartAtUtc);
    const proposed = resolveEvidenceBackedStartBoundary({
      candidateStartAt: candidate,
      confirmedAt: new Date(fixture.confirmedAtUtc),
      segments: fixture.segments,
      corePoints: [],
      routePoints: [],
      profile: fixture.profile,
      integrationModality: fixture.integrationModality,
    });
    expect(proposed.decision).toBe('PROVIDER_START_UNCORROBORATED');
    expect(proposed.canonicalStartAt).toEqual(candidate);
  });
});
