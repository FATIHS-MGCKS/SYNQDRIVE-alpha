import {
  buildTirePressureContext,
  isHmStatusIssueToken,
  selectWheelCandidate,
} from './tire-pressure-context.builder';

const AS_OF = new Date('2026-07-16T14:00:00.000Z');

function dimoOnly(pressures: {
  fl?: number | null;
  fr?: number | null;
  rl?: number | null;
  rr?: number | null;
  timestamp?: Date;
  tpmsWarning?: boolean;
  tpmsPresent?: boolean;
}) {
  const ts = pressures.timestamp ?? new Date('2026-07-16T13:30:00.000Z');
  return {
    dimo: {
      tirePressureFl: pressures.fl ?? null,
      tirePressureFr: pressures.fr ?? null,
      tirePressureRl: pressures.rl ?? null,
      tirePressureRr: pressures.rr ?? null,
      providerSource: 'DIMO',
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lastSeenAt: ts,
      perWheelTimestamps: {
        frontLeft: ts,
        frontRight: ts,
        rearLeft: ts,
        rearRight: ts,
      },
      tpmsWarning:
        pressures.tpmsPresent === false
          ? { signalPresent: false, value: null, sourceTimestamp: null }
          : pressures.tpmsWarning != null
            ? {
                signalPresent: true,
                value: pressures.tpmsWarning,
                sourceTimestamp: ts,
              }
            : undefined,
    },
    asOf: AS_OF,
  };
}

describe('tire-pressure-context.builder', () => {
  it('builds DIMO-only context with four wheels in bar', () => {
    const ctx = buildTirePressureContext(
      dimoOnly({ fl: 2.74, fr: 3.01, rl: 2.74, rr: 2.89 }),
    );
    expect(ctx.sourceType).toBe('DIMO');
    expect(ctx.frontLeft).toBe(2.74);
    expect(ctx.frontRight).toBe(3.01);
    expect(ctx.wheels.frontLeft.sourceProvider).toBe('DIMO');
    expect(ctx.normalizedUnit).toBe('BAR');
    expect(ctx.coverage.wheelsAvailable).toBe(4);
    expect(ctx.coverage.coveragePercent).toBe(100);
  });

  it('builds HM-only context without DIMO conversion heuristics', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      hm: {
        frontLeft: 2.75,
        frontRight: 2.85,
        rearLeft: 2.77,
        rearRight: 2.82,
        unit: 'bar',
        lastUpdatedAt: '2026-07-16T13:55:00.000Z',
        freshnessStatus: 'fresh',
        overallStatus: 'OK',
      },
    });
    expect(ctx.sourceType).toBe('HIGH_MOBILITY');
    expect(ctx.frontLeft).toBe(2.75);
    expect(ctx.hmFreshness).not.toBe('no_data');
  });

  it('marks MIXED when wheels come from different providers', () => {
    const dimoTs = new Date('2026-07-16T13:40:00.000Z');
    const hmTs = new Date('2026-07-16T12:00:00.000Z');
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: 2.74,
        tirePressureFr: 2.8,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: dimoTs,
        providerFetchedAt: null,
        lastSeenAt: null,
        perWheelTimestamps: {
          frontLeft: dimoTs,
          frontRight: dimoTs,
        },
      },
      hm: {
        frontLeft: 2.5,
        frontRight: 2.5,
        rearLeft: 2.55,
        rearRight: 2.58,
        unit: 'bar',
        lastUpdatedAt: hmTs.toISOString(),
        freshnessStatus: 'fresh',
        overallStatus: 'OK',
      },
    });
    expect(ctx.sourceType).toBe('MIXED');
    expect(ctx.wheels.frontLeft.sourceProvider).toBe('DIMO');
    expect(ctx.wheels.rearLeft.sourceProvider).toBe('HIGH_MOBILITY');
  });

  it('returns NONE when no feeds exist', () => {
    const ctx = buildTirePressureContext({ asOf: AS_OF });
    expect(ctx.sourceType).toBe('NONE');
    expect(ctx.frontLeft).toBeNull();
    expect(ctx.overallFreshness).toBe('no_data');
    expect(ctx.wearEligibility.eligible).toBe(false);
  });

  it('reports partial coverage — not 100% from one wheel', () => {
    const ctx = buildTirePressureContext(
      dimoOnly({ fl: 2.5, fr: null, rl: null, rr: null }),
    );
    expect(ctx.coverage.wheelsAvailable).toBe(1);
    expect(ctx.coverage.coveragePercent).toBe(25);
    expect(ctx.coverage.meetsWearThreshold).toBe(false);
  });

  it('prefers newer timestamp per wheel (source priority)', () => {
    const dimoCandidate = {
      value: 2.4,
      sourceProvider: 'DIMO' as const,
      sourceTimestamp: new Date('2026-07-16T10:00:00.000Z'),
      plausibility: 'valid' as const,
      statusToken: null,
      statusIssue: false,
    };
    const hmCandidate = {
      value: 2.7,
      sourceProvider: 'HIGH_MOBILITY' as const,
      sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
      plausibility: 'valid' as const,
      statusToken: null,
      statusIssue: false,
    };
    expect(selectWheelCandidate(dimoCandidate, hmCandidate)?.sourceProvider).toBe(
      'HIGH_MOBILITY',
    );
    expect(selectWheelCandidate(hmCandidate, dimoCandidate)?.sourceProvider).toBe(
      'HIGH_MOBILITY',
    );
  });

  it('does not overwrite newer values with older timestamps', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: 2.9,
        tirePressureFr: null,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:45:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
        perWheelTimestamps: {
          frontLeft: new Date('2026-07-16T13:45:00.000Z'),
        },
      },
      hm: {
        frontLeft: 2.5,
        frontRight: null,
        rearLeft: null,
        rearRight: null,
        unit: 'bar',
        lastUpdatedAt: '2026-07-16T12:00:00.000Z',
        freshnessStatus: 'fresh',
      },
    });
    expect(ctx.frontLeft).toBe(2.9);
    expect(ctx.wheels.frontLeft.sourceProvider).toBe('DIMO');
  });

  it('marks stale wheels and disables continuous exposure', () => {
    const ctx = buildTirePressureContext(
      dimoOnly({
        fl: 2.5,
        fr: 2.5,
        rl: 2.5,
        rr: 2.5,
        timestamp: new Date('2026-07-15T08:00:00.000Z'),
      }),
    );
    expect(ctx.overallFreshness).toBe('stale');
    expect(ctx.coverage.continuousExposureEligible).toBe(false);
    expect(ctx.wearEligibility.eligible).toBe(false);
  });

  it('handles TPMS warning without numeric pressures', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: null,
        tirePressureFr: null,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
        tpmsWarning: {
          signalPresent: true,
          value: true,
          sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        },
      },
    });
    expect(ctx.tpmsWarning).toBe(true);
    expect(ctx.tpmsWarningSource).toBe('DIMO');
    expect(ctx.overallStatus).toBe('ISSUE');
    expect(ctx.wearEligibility.eligible).toBe(false);
  });

  it('handles numeric pressure without TPMS warning signal', () => {
    const ctx = buildTirePressureContext(
      dimoOnly({
        fl: 2.6,
        fr: 2.6,
        rl: 2.6,
        rr: 2.6,
        tpmsPresent: false,
      }),
    );
    expect(ctx.tpmsWarning).toBeNull();
    expect(ctx.frontLeft).toBe(2.6);
  });

  it('detects HM/DIMO contradiction via per-wheel source metadata', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: 2.2,
        tirePressureFr: 2.2,
        tirePressureRl: 2.2,
        tirePressureRr: 2.2,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:40:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
      },
      hm: {
        frontLeft: 1.4,
        frontRight: 1.4,
        rearLeft: 1.4,
        rearRight: 1.4,
        unit: 'bar',
        statusFrontLeft: 'LOW',
        statusFrontRight: 'LOW',
        statusRearLeft: 'LOW',
        statusRearRight: 'LOW',
        overallStatus: 'ISSUE',
        lastUpdatedAt: '2026-07-16T13:50:00.000Z',
        freshnessStatus: 'fresh',
      },
    });
    expect(ctx.sourceType).toBe('HIGH_MOBILITY');
    expect(ctx.tpmsWarning).toBe(true);
    expect(ctx.qualityWarnings).toContain('TPMS warning active.');
  });

  it('converts HM kilopascals explicitly', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      hm: {
        frontLeft: 275,
        frontRight: 285,
        rearLeft: 277,
        rearRight: 282,
        unit: 'kilopascals',
        lastUpdatedAt: '2026-07-16T13:55:00.000Z',
        freshnessStatus: 'fresh',
      },
    });
    expect(ctx.frontLeft).toBe(2.75);
  });

  it('exposes per-wheel freshness and timestamps', () => {
    const flTs = new Date('2026-07-16T13:10:00.000Z');
    const frTs = new Date('2026-07-16T13:20:00.000Z');
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: 2.5,
        tirePressureFr: 2.6,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: flTs,
        providerFetchedAt: null,
        lastSeenAt: null,
        perWheelTimestamps: {
          frontLeft: flTs,
          frontRight: frTs,
        },
      },
    });
    expect(ctx.wheels.frontLeft.sourceTimestamp).toBe(flTs.toISOString());
    expect(ctx.wheels.frontRight.sourceTimestamp).toBe(frTs.toISOString());
    expect(ctx.coverage.periodStart).toBe(flTs.toISOString());
    expect(ctx.coverage.periodEnd).toBe(frTs.toISOString());
  });

  it('uses structured HM status tokens for severity', () => {
    expect(isHmStatusIssueToken('LOW')).toBe(true);
    expect(isHmStatusIssueToken('OK')).toBe(false);
  });

  it('disables wear eligibility when recommended pressure is not confirmed', () => {
    const ctx = buildTirePressureContext({
      ...dimoOnly({ fl: 2.5, fr: 2.5, rl: 2.5, rr: 2.5 }),
      asOf: AS_OF,
      recommendedPressure: {
        recommendedPressureFrontBar: 2.5,
        recommendedPressureRearBar: 2.5,
        recommendedPressureLoadedFrontBar: null,
        recommendedPressureLoadedRearBar: null,
        pressureSpecSource: 'AI_ESTIMATED',
        pressureSpecConfirmedAt: null,
        pressureSpecConfidence: 42,
        wearFactorEligible: false,
        pressureSpecMissingLabel: 'Solldruck nicht hinterlegt',
      },
    });
    expect(ctx.wearEligibility.eligible).toBe(false);
    expect(ctx.pressureSpecMissingLabel).toBe('Solldruck nicht hinterlegt');
  });

  it('enables wear eligibility with confirmed door-placard spec', () => {
    const ctx = buildTirePressureContext({
      ...dimoOnly({ fl: 2.4, fr: 2.4, rl: 2.6, rr: 2.6 }),
      asOf: AS_OF,
      recommendedPressure: {
        recommendedPressureFrontBar: 2.4,
        recommendedPressureRearBar: 2.6,
        recommendedPressureLoadedFrontBar: null,
        recommendedPressureLoadedRearBar: null,
        pressureSpecSource: 'DOOR_PLACARD',
        pressureSpecConfirmedAt: '2026-07-01T00:00:00.000Z',
        pressureSpecConfidence: 98,
        wearFactorEligible: true,
        pressureSpecMissingLabel: null,
      },
    });
    expect(ctx.wearEligibility.eligible).toBe(true);
    expect(ctx.recommendedPressure.pressureSpecSource).toBe('DOOR_PLACARD');
  });
});
