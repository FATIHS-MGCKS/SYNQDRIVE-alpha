import {
  buildSetupPeriodsFromSetups,
  computeTripUsageAggregateDelta,
  intervalsOverlap,
  isTripCanonicallyFinalForTireUsage,
  resolveSetupAttributionForTrip,
  TIRE_TRIP_USAGE_ATTRIBUTION_REASON,
} from './tire-trip-usage-attribution';
import { areAnalysisStagesComplete } from '../trips/trip-analysis-status';

describe('tire-trip-usage-attribution', () => {
  const tripStart = new Date('2026-07-10T10:00:00.000Z');
  const tripEnd = new Date('2026-07-10T11:00:00.000Z');

  it('detects canonical finalization only when analysis stages are terminal', () => {
    const stages = {
      behavior: 'done',
      route: 'done',
      misuse: 'done',
      drivingImpact: 'done',
    } as const;
    expect(areAnalysisStagesComplete(stages)).toBe(true);
    expect(
      isTripCanonicallyFinalForTireUsage({
        tripStatus: 'COMPLETED',
        endTime: tripEnd,
        tripAnalysisStatus: 'COMPLETED',
        analysisStagesJson: stages,
      }),
    ).toBe(true);
  });

  it('rejects provisional partial analysis state', () => {
    expect(
      isTripCanonicallyFinalForTireUsage({
        tripStatus: 'COMPLETED',
        endTime: tripEnd,
        tripAnalysisStatus: 'PARTIAL',
        analysisStagesJson: {
          behavior: 'done',
          route: 'pending',
          misuse: 'pending',
          drivingImpact: 'pending',
        },
      }),
    ).toBe(false);
  });

  it('resolves single setup for trip fully inside one mount period', () => {
    const result = resolveSetupAttributionForTrip({
      trip: { tripStartedAt: tripStart, tripEndedAt: tripEnd },
      periods: [
        {
          tireSetupId: 'setup-a',
          installedAt: new Date('2026-07-01T00:00:00.000Z'),
          removedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });
    expect(result).toEqual({ status: 'SINGLE', tireSetupId: 'setup-a' });
  });

  it('attributes trip before tire change to pre-change setup', () => {
    const result = resolveSetupAttributionForTrip({
      trip: {
        tripStartedAt: new Date('2026-07-09T10:00:00.000Z'),
        tripEndedAt: new Date('2026-07-09T11:00:00.000Z'),
      },
      periods: [
        {
          tireSetupId: 'setup-old',
          installedAt: new Date('2026-06-01T00:00:00.000Z'),
          removedAt: new Date('2026-07-10T12:00:00.000Z'),
        },
        {
          tireSetupId: 'setup-new',
          installedAt: new Date('2026-07-10T12:00:00.000Z'),
          removedAt: null,
        },
      ],
    });
    expect(result).toEqual({ status: 'SINGLE', tireSetupId: 'setup-old' });
  });

  it('attributes trip after tire change to post-change setup', () => {
    const result = resolveSetupAttributionForTrip({
      trip: {
        tripStartedAt: new Date('2026-07-11T10:00:00.000Z'),
        tripEndedAt: new Date('2026-07-11T11:00:00.000Z'),
      },
      periods: [
        {
          tireSetupId: 'setup-old',
          installedAt: new Date('2026-06-01T00:00:00.000Z'),
          removedAt: new Date('2026-07-10T12:00:00.000Z'),
        },
        {
          tireSetupId: 'setup-new',
          installedAt: new Date('2026-07-10T12:00:00.000Z'),
          removedAt: null,
        },
      ],
    });
    expect(result).toEqual({ status: 'SINGLE', tireSetupId: 'setup-new' });
  });

  it('flags overlapping trip spanning setup change as REQUIRES_REVIEW', () => {
    const result = resolveSetupAttributionForTrip({
      trip: {
        tripStartedAt: new Date('2026-07-10T11:30:00.000Z'),
        tripEndedAt: new Date('2026-07-10T13:30:00.000Z'),
      },
      periods: [
        {
          tireSetupId: 'setup-old',
          installedAt: new Date('2026-06-01T00:00:00.000Z'),
          removedAt: new Date('2026-07-10T12:00:00.000Z'),
        },
        {
          tireSetupId: 'setup-new',
          installedAt: new Date('2026-07-10T12:00:00.000Z'),
          removedAt: null,
        },
      ],
    });
    expect(result.status).toBe('REQUIRES_REVIEW');
    if (result.status === 'REQUIRES_REVIEW') {
      expect(result.tireSetupIds).toEqual(expect.arrayContaining(['setup-old', 'setup-new']));
      expect(result.reason).toBe(
        TIRE_TRIP_USAGE_ATTRIBUTION_REASON.SETUP_CHANGE_BOUNDARY_IN_TRIP,
      );
    }
  });

  it('returns NO_SETUP when no period matches trip interval', () => {
    const result = resolveSetupAttributionForTrip({
      trip: { tripStartedAt: tripStart, tripEndedAt: tripEnd },
      periods: [
        {
          tireSetupId: 'setup-future',
          installedAt: new Date('2026-08-01T00:00:00.000Z'),
          removedAt: null,
        },
      ],
    });
    expect(result).toEqual({ status: 'NO_SETUP' });
  });

  it('builds fallback periods from setup installed/removed timestamps', () => {
    const periods = buildSetupPeriodsFromSetups([
      {
        id: 'setup-1',
        installedAt: new Date('2026-07-01T00:00:00.000Z'),
        removedAt: null,
      },
      { id: 'setup-2', installedAt: null, removedAt: null },
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.tireSetupId).toBe('setup-1');
  });

  it('computes aggregate delta for reprocessing', () => {
    const delta = computeTripUsageAggregateDelta(
      {
        distanceKm: 10,
        cityKm: 5,
        ruralKm: 2,
        highwayKm: 3,
        harshAccelerationCount: 1,
        harshBrakingCount: 1,
        harshCorneringCount: 0,
      },
      {
        distanceKm: 12,
        cityKm: 6,
        ruralKm: 2,
        highwayKm: 4,
        harshAccelerationCount: 2,
        harshBrakingCount: 1,
        harshCorneringCount: 1,
      },
    );
    expect(delta).toEqual({
      distanceKm: 2,
      cityKm: 1,
      ruralKm: 0,
      highwayKm: 1,
      harshAccelerationCount: 1,
      harshBrakingCount: 0,
      harshCorneringCount: 1,
    });
  });

  it('interval overlap helper is symmetric', () => {
    const aStart = new Date('2026-07-10T10:00:00.000Z');
    const aEnd = new Date('2026-07-10T11:00:00.000Z');
    const bStart = new Date('2026-07-10T10:30:00.000Z');
    expect(intervalsOverlap(aStart, aEnd, bStart, null)).toBe(true);
  });
});
