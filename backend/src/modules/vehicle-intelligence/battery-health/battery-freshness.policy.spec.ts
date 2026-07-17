import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildBatteryDomainFreshnessBundle,
  buildFetchFreshness,
  buildObservationFreshness,
  buildUnavailableObservationFreshness,
  observationFreshnessIsDecisionFresh,
  toLegacyFreshnessInfo,
} from './battery-freshness.policy';

describe('battery-freshness.policy', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');

  describe('buildFetchFreshness', () => {
    it.each([
      {
        name: 'fresh fetch',
        fetchedAt: new Date('2026-07-16T11:50:00.000Z'),
        expectedState: 'FRESH',
      },
      {
        name: 'stale fetch',
        fetchedAt: new Date('2026-07-16T10:00:00.000Z'),
        expectedState: 'STALE',
      },
      {
        name: 'missing fetch timestamp',
        fetchedAt: null,
        expectedState: 'UNAVAILABLE',
      },
    ])('$name', ({ fetchedAt, expectedState }) => {
      const result = buildFetchFreshness({ fetchedAt, now });
      expect(result.fetchState).toBe(expectedState);
      if (fetchedAt) {
        expect(result.fetchedAt).toBe(fetchedAt.toISOString());
        expect(result.fetchAgeMs).toBe(now.getTime() - fetchedAt.getTime());
      } else {
        expect(result.fetchedAt).toBeNull();
        expect(result.fetchAgeMs).toBeNull();
      }
    });
  });

  describe('buildObservationFreshness', () => {
    it.each([
      {
        name: 'fresh observation within LV threshold',
        observedAt: new Date('2026-07-15T12:00:00.000Z'),
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
        expectedState: 'FRESH',
      },
      {
        name: 'stale observation beyond HV telemetry threshold',
        observedAt: new Date('2026-07-01T12:00:00.000Z'),
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
        expectedState: 'STALE',
      },
      {
        name: 'missing timestamp with value carrier',
        observedAt: null,
        hasValueCarrier: true,
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
        expectedState: 'MISSING_TIMESTAMP',
      },
      {
        name: 'missing timestamp without value carrier',
        observedAt: null,
        hasValueCarrier: false,
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
        expectedState: 'UNAVAILABLE',
      },
      {
        name: 'out-of-order observation vs last known',
        observedAt: new Date('2026-07-10T12:00:00.000Z'),
        lastObservedAt: new Date('2026-07-15T12:00:00.000Z'),
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
        expectedState: 'OUT_OF_ORDER',
      },
    ])(
      '$name',
      ({ observedAt, maxAgeMs, hasValueCarrier, lastObservedAt, expectedState }) => {
        const result = buildObservationFreshness({
          observedAt,
          maxAgeMs,
          now,
          hasValueCarrier,
          lastObservedAt,
        });
        expect(result.observationState).toBe(expectedState);
      },
    );
  });

  describe('fetch vs observation separation', () => {
    it('fresh fetch does not make a stale observed value decision-fresh', () => {
      const freshFetch = buildFetchFreshness({
        fetchedAt: new Date('2026-07-16T11:55:00.000Z'),
        now,
      });
      const staleObservation = buildObservationFreshness({
        observedAt: new Date('2026-05-01T12:00:00.000Z'),
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
        now,
        hasValueCarrier: true,
      });

      expect(freshFetch.fetchState).toBe('FRESH');
      expect(staleObservation.observationState).toBe('STALE');
      expect(observationFreshnessIsDecisionFresh(staleObservation)).toBe(false);
    });

    it('stale fetch can still carry a fresh observed value', () => {
      const staleFetch = buildFetchFreshness({
        fetchedAt: new Date('2026-07-16T08:00:00.000Z'),
        now,
      });
      const freshObservation = buildObservationFreshness({
        observedAt: new Date('2026-07-16T11:30:00.000Z'),
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
        now,
        hasValueCarrier: true,
      });

      expect(staleFetch.fetchState).toBe('STALE');
      expect(freshObservation.observationState).toBe('FRESH');
      expect(observationFreshnessIsDecisionFresh(freshObservation)).toBe(true);
    });
  });

  describe('legacy adapter', () => {
    it('maps observation freshness to legacy isFresh only when FRESH', () => {
      const fresh = toLegacyFreshnessInfo(
        buildObservationFreshness({
          observedAt: new Date('2026-07-16T11:50:00.000Z'),
          maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.fetchLive,
          now,
          hasValueCarrier: true,
        }),
      );
      expect(fresh.isFresh).toBe(true);

      const missing = toLegacyFreshnessInfo(
        buildObservationFreshness({
          observedAt: null,
          maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.fetchLive,
          now,
          hasValueCarrier: true,
        }),
      );
      expect(missing.isFresh).toBe(false);
      expect(missing.observedAt).toBeNull();
    });
  });

  describe('buildBatteryDomainFreshnessBundle', () => {
    it('exposes future domain freshness slots as null by default', () => {
      const fetch = buildFetchFreshness({
        fetchedAt: new Date('2026-07-16T11:55:00.000Z'),
        now,
      });
      const observation = buildUnavailableObservationFreshness();
      const bundle = buildBatteryDomainFreshnessBundle({ fetch, observation });

      expect(bundle.fetch).toBe(fetch);
      expect(bundle.observation).toBe(observation);
      expect(bundle.restMeasurementFreshness).toBeNull();
      expect(bundle.startProxyFreshness).toBeNull();
      expect(bundle.assessmentFreshness).toBeNull();
      expect(bundle.publicationFreshness).toBeNull();
      expect(bundle.providerSohFreshness).toBeNull();
      expect(bundle.hvSessionFreshness).toBeNull();
    });
  });
});
