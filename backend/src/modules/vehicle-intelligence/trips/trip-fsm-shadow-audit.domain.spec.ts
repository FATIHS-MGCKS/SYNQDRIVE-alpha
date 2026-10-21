import {
  aggregateShadowAuditRows,
  correlateConsecutiveTripPauses,
  deriveShadowFalseEndRiskObserved,
  deriveShadowProviderSilenceCompetedWithStrongerPath,
  extractTripLifecycleTimestamps,
  formatShadowAuditRow,
  validateShadowAuditCliArgs,
} from './trip-fsm-shadow-audit.domain';
import { TripStatus } from '@prisma/client';

describe('trip-fsm-shadow-audit.domain', () => {
  it('extractTripLifecycleTimestamps keeps end, completed, resting distinct', () => {
    const lifecycle = extractTripLifecycleTimestamps({
      endTime: new Date('2026-09-13T11:00:00.000Z'),
      tripStatus: TripStatus.COMPLETED,
      rawDetectionMeta: {
        endRecognizedAt: '2026-09-13T11:00:05.000Z',
      },
      restingObservedAt: new Date('2026-09-13T11:00:10.000Z'),
    });
    expect(lifecycle.realEndAt).toBe('2026-09-13T11:00:00.000Z');
    expect(lifecycle.realCompletedAt).toBe('2026-09-13T11:00:05.000Z');
    expect(lifecycle.realRestingAt).toBe('2026-09-13T11:00:10.000Z');
    expect(lifecycle.realEndAt).not.toBe(lifecycle.realCompletedAt);
    expect(lifecycle.realCompletedAt).not.toBe(lifecycle.realRestingAt);
  });

  it('deriveShadowProviderSilenceCompetedWithStrongerPath is YES only when both observed', () => {
    expect(
      deriveShadowProviderSilenceCompetedWithStrongerPath({
        shadow: {
          providerSilence: {
            everEvaluated: true,
            everEligible: true,
            realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
          },
          pauses: { episodeCount: 0, resumedEpisodeCount: 0, longestPauseMs: 0, outcomes: [], sameTripResumeCount: 0, newTripAfterTerminalCount: 0, ambiguousCount: 0 },
        } as any,
      }),
    ).toBe('YES');
  });

  it('deriveShadowFalseEndRiskObserved requires movement invalidation', () => {
    expect(
      deriveShadowFalseEndRiskObserved({
        shadow: {
          providerSilence: {
            everEvaluated: true,
            everEligible: true,
            invalidatedByMovement: true,
          },
          pauses: { episodeCount: 0, resumedEpisodeCount: 0, longestPauseMs: 0, outcomes: [], sameTripResumeCount: 0, newTripAfterTerminalCount: 0, ambiguousCount: 0 },
        } as any,
      }),
    ).toBe('YES');
    expect(
      deriveShadowFalseEndRiskObserved({
        shadow: {
          providerSilence: {
            everEvaluated: true,
            everEligible: true,
            realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
            invalidatedByMovement: false,
          },
          pauses: { episodeCount: 0, resumedEpisodeCount: 0, longestPauseMs: 0, outcomes: [], sameTripResumeCount: 0, newTripAfterTerminalCount: 0, ambiguousCount: 0 },
        } as any,
      }),
    ).toBe('NO');
  });

  it('correlates consecutive same-vehicle trips after terminalization', () => {
    const tripA = {
      vehicleId: 'veh-1',
      tripId: 'trip-a',
      startAt: new Date('2026-09-13T10:00:00.000Z'),
      endTime: new Date('2026-09-13T10:01:15.000Z'),
      tripStatus: TripStatus.COMPLETED,
      rawDetectionMeta: {
        shadowObservability: {
          pauses: {
            episodes: [
              {
                shadowPauseOutcome: 'NO_RESUME_OBSERVED',
                episodeStartedAt: '2026-09-13T10:00:10.000Z',
                bestObservedStopAnchorAt: '2026-09-13T10:00:10.000Z',
              },
            ],
          },
        },
      },
      restingObservedAt: new Date('2026-09-13T10:01:25.000Z'),
      lifecycle: extractTripLifecycleTimestamps({
        endTime: new Date('2026-09-13T10:01:15.000Z'),
        tripStatus: TripStatus.COMPLETED,
        rawDetectionMeta: { endRecognizedAt: '2026-09-13T10:01:20.000Z' },
        restingObservedAt: new Date('2026-09-13T10:01:25.000Z'),
      }),
      shadow: null,
    };
    const tripB = {
      vehicleId: 'veh-1',
      tripId: 'trip-b',
      startAt: new Date('2026-09-13T10:05:00.000Z'),
      endTime: null,
      tripStatus: TripStatus.ONGOING,
      rawDetectionMeta: {},
      restingObservedAt: null,
      lifecycle: extractTripLifecycleTimestamps({
        endTime: null,
        tripStatus: TripStatus.ONGOING,
        rawDetectionMeta: {},
        restingObservedAt: null,
      }),
      shadow: null,
    };
    tripA.shadow = (tripA.rawDetectionMeta as any).shadowObservability;
    const correlations = correlateConsecutiveTripPauses([tripA, tripB]);
    expect(correlations).toHaveLength(1);
    expect(correlations[0]?.crossTripPauseOutcome).toBe('NEW_TRIP_AFTER_RESTING');
    expect(correlations[0]?.interTripPauseMs).toBe(4 * 60_000 + 50_000);
  });

  it('validateShadowAuditCliArgs fails closed without DATABASE_URL', () => {
    expect(
      validateShadowAuditCliArgs({
        fixturesOnly: false,
        databaseUrl: undefined,
      }).ok,
    ).toBe(false);
  });

  it('validateShadowAuditCliArgs requires bounded scope for real audit', () => {
    expect(
      validateShadowAuditCliArgs({
        fixturesOnly: false,
        databaseUrl: 'postgres://local',
      }).ok,
    ).toBe(false);
  });

  it('formatShadowAuditRow never hardcodes cross-trip leak', () => {
    const row = formatShadowAuditRow(
      {
        vehicleId: 'veh-1',
        tripId: 'trip-a',
        startAt: new Date('2026-09-13T10:00:00.000Z'),
        endTime: new Date('2026-09-13T10:01:00.000Z'),
        tripStatus: TripStatus.COMPLETED,
        rawDetectionMeta: {
          shadowObservability: {
            providerSilence: {
              everEvaluated: true,
              candidateTripId: 'trip-b',
            },
          },
        },
        restingObservedAt: null,
      },
      extractTripLifecycleTimestamps({
        endTime: new Date('2026-09-13T10:01:00.000Z'),
        tripStatus: TripStatus.COMPLETED,
        rawDetectionMeta: {},
        restingObservedAt: null,
      }),
    );
    expect(row.SHADOW_CROSS_TRIP_LEAK_OBSERVED).toBe('YES');
  });

  it('aggregateShadowAuditRows derives counts from evidence', () => {
    const totals = aggregateShadowAuditRows([
      {
        TRIP_ID: 'a',
        SHADOW_PROVIDER_SILENCE_ELIGIBLE: true,
        SHADOW_PROVIDER_SILENCE_TRUST: false,
        SHADOW_PROVIDER_SILENCE_BLOCKED_BY: 'post_stop_movement_detected',
        SAME_TRIP_RESUME_COUNT: 1,
        NEW_TRIP_AFTER_TERMINAL_COUNT: 0,
        AMBIGUOUS_PAUSE_COUNT: 0,
      } as any,
    ]);
    expect(totals.PROVIDER_SILENCE_WOULD_HAVE_BEEN_NEEDED).toBe(1);
    expect(totals.PROVIDER_SILENCE_CORRECTLY_BLOCKED_BY_MOVEMENT).toBe(1);
  });
});
