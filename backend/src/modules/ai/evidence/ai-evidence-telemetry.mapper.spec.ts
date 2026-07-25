import {
  AI_TELEMETRY_SEMANTICS_MAPPING_TABLE,
  hasAiTelemetryFreshLiveHint,
  mapCanonicalTelemetryFreshnessToSemantics,
  mapDashboardTelemetryStateToSemantics,
  mapTelemetryToAiEvidenceSemantics,
} from './ai-evidence-telemetry.mapper';
import {
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
  type AiEvidenceTelemetrySemantics,
} from './ai-evidence-telemetry.enums';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const NOW_MS = new Date('2026-07-24T12:00:00.000Z').getTime();

function hoursAgo(h: number): number {
  return NOW_MS - h * 3_600_000;
}

function minutesAgo(m: number): number {
  return NOW_MS - m * 60_000;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    entityId: VEHICLE_ID,
    timestampEvidence: {
      providerObservedAt: new Date(minutesAgo(5)).toISOString(),
    },
    hasProviderLink: true,
    ...overrides,
  };
}

describe('ai-evidence-telemetry.mapper', () => {
  describe('threshold constants (re-exported, not redefined)', () => {
    it('matches canonical 15m / 24h / 48h boundaries', () => {
      expect(TELEMETRY_FRESH_THRESHOLD_MS).toBe(15 * 60 * 1000);
      expect(TELEMETRY_STANDBY_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
      expect(TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('mapTelemetryToAiEvidenceSemantics — age boundaries', () => {
    it.each([
      { label: '0 min', ageMs: 0, expectedCanonical: 'live', expectedSemantics: 'live' },
      {
        label: 'live edge',
        ageMs: TELEMETRY_FRESH_THRESHOLD_MS - 1,
        expectedCanonical: 'live',
        expectedSemantics: 'live',
      },
      {
        label: 'standby start',
        ageMs: TELEMETRY_FRESH_THRESHOLD_MS,
        expectedCanonical: 'standby',
        expectedSemantics: 'standby',
      },
      {
        label: '23:59h',
        ageMs: TELEMETRY_STANDBY_THRESHOLD_MS - 60_000,
        expectedCanonical: 'standby',
        expectedSemantics: 'standby',
      },
      {
        label: '24h → soft_offline',
        ageMs: TELEMETRY_STANDBY_THRESHOLD_MS,
        expectedCanonical: 'signal_delayed',
        expectedSemantics: 'soft_offline',
      },
      {
        label: '47:59h',
        ageMs: TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS - 60_000,
        expectedCanonical: 'signal_delayed',
        expectedSemantics: 'soft_offline',
      },
      {
        label: '48h → offline',
        ageMs: TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
        expectedCanonical: 'offline',
        expectedSemantics: 'offline',
        lastKnownPositionAvailable: false,
      },
    ])(
      '$label → canonical=$expectedCanonical semantics=$expectedSemantics',
      ({ ageMs, expectedCanonical, expectedSemantics, lastKnownPositionAvailable }) => {
        const observed = new Date(NOW_MS - ageMs).toISOString();
        const result = mapTelemetryToAiEvidenceSemantics(
          baseInput({
            timestampEvidence: { providerObservedAt: observed },
            nowMs: NOW_MS,
            ...(lastKnownPositionAvailable !== undefined
              ? { lastKnownPositionAvailable }
              : {}),
          }),
        );
        expect(result.canonicalFreshness).toBe(expectedCanonical);
        expect(result.telemetrySemantics).toBe(expectedSemantics);
        expect(result.observedAt).toBe(observed);
      },
    );

    it('no timestamp → unknown / no_signal / unavailable', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {},
          nowMs: NOW_MS,
        }),
      );
      expect(result.canonicalFreshness).toBe('no_signal');
      expect(result.telemetrySemantics).toBe('unknown');
      expect(result.freshness).toBe('no_signal');
      expect(result.availability).toBe('unavailable');
    });
  });

  describe('live vs fresh distinction', () => {
    it('maps to fresh when live hints present within 15 min', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {
            providerObservedAt: new Date(minutesAgo(5)).toISOString(),
          },
          liveHints: { isLiveTracking: true },
          nowMs: NOW_MS,
        }),
      );
      expect(result.telemetrySemantics).toBe('fresh');
      expect(result.freshness).toBe('live');
      expect(result.availability).toBe('available');
    });

    it('hasAiTelemetryFreshLiveHint respects threshold', () => {
      expect(
        hasAiTelemetryFreshLiveHint({ isLiveTracking: true }, TELEMETRY_FRESH_THRESHOLD_MS),
      ).toBe(false);
      expect(
        hasAiTelemetryFreshLiveHint({ isLiveTracking: true }, TELEMETRY_FRESH_THRESHOLD_MS - 1),
      ).toBe(true);
    });
  });

  describe('stale and last-known position', () => {
    it('signal_delayed + lastKnown → stale semantics', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {
            providerObservedAt: new Date(hoursAgo(30)).toISOString(),
          },
          lastKnownPositionAvailable: true,
          nowMs: NOW_MS,
        }),
      );
      expect(result.canonicalFreshness).toBe('signal_delayed');
      expect(result.telemetrySemantics).toBe('stale');
      expect(result.availability).toBe('partial');
      expect(result.reasonCode).toBe('stale_data');
    });

    it('offline + lastKnown → stale semantics', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {
            providerObservedAt: new Date(hoursAgo(72)).toISOString(),
          },
          nowMs: NOW_MS,
        }),
      );
      expect(result.telemetrySemantics).toBe('stale');
      expect(result.freshness).toBe('offline');
    });

    it('historical snapshot in standby → stale', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {
            providerObservedAt: new Date(hoursAgo(2)).toISOString(),
          },
          isHistoricalSnapshot: true,
          nowMs: NOW_MS,
        }),
      );
      expect(result.telemetrySemantics).toBe('stale');
      expect(result.availability).toBe('partial');
    });
  });

  describe('meta states', () => {
    it('permission_denied', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({ permissionDenied: true }),
      );
      expect(result.telemetrySemantics).toBe('permission_denied');
      expect(result.availability).toBe('permission_denied');
      expect(result.freshness).toBe('not_applicable');
    });

    it('not_supported for unsupported signal', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({ signalSupported: false }),
      );
      expect(result.telemetrySemantics).toBe('not_supported');
      expect(result.reasonCode).toBe('signal_not_supported');
      expect(result.availability).toBe('unavailable');
    });

    it('unavailable on provider outage', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({ providerOutage: true }),
      );
      expect(result.telemetrySemantics).toBe('unavailable');
      expect(result.reasonCode).toBe('provider_outage');
    });

    it('unavailable when provider not linked', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({ hasProviderLink: false }),
      );
      expect(result.telemetrySemantics).toBe('unavailable');
      expect(result.availability).toBe('unavailable');
      expect(result.warnings).toContain('provider_not_linked');
    });
  });

  describe('state transitions across boundaries', () => {
    const boundaries = [
      TELEMETRY_FRESH_THRESHOLD_MS,
      TELEMETRY_STANDBY_THRESHOLD_MS,
      TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
    ];

    it('walks from live through offline across all thresholds', () => {
      const semantics: string[] = [];
      const checkpoints = [
        minutesAgo(1),
        minutesAgo(20),
        hoursAgo(2),
        hoursAgo(30),
        hoursAgo(72),
      ];
      for (const observedMs of checkpoints) {
        const mapped = mapTelemetryToAiEvidenceSemantics(
          baseInput({
            timestampEvidence: {
              providerObservedAt: new Date(observedMs).toISOString(),
            },
            nowMs: NOW_MS,
          }),
        );
        semantics.push(mapped.telemetrySemantics);
      }
      expect(semantics).toEqual(['live', 'standby', 'standby', 'soft_offline', 'stale']);
    });

    it.each(boundaries)('does not throw at boundary %i ms', (boundaryMs) => {
      for (const offset of [-1, 0, 1]) {
        const observed = new Date(NOW_MS - boundaryMs + offset).toISOString();
        expect(() =>
          mapTelemetryToAiEvidenceSemantics(
            baseInput({
              timestampEvidence: { providerObservedAt: observed },
              nowMs: NOW_MS,
            }),
          ),
        ).not.toThrow();
      }
    });
  });

  describe('cross-surface terminology helpers', () => {
    it('maps dashboard soft_offline to AI soft_offline', () => {
      expect(mapDashboardTelemetryStateToSemantics('soft_offline')).toBe('soft_offline');
    });

    it('maps dashboard unknown to AI unknown', () => {
      expect(mapDashboardTelemetryStateToSemantics('unknown')).toBe('unknown');
    });

    it('maps canonical signal_delayed default to soft_offline', () => {
      expect(mapCanonicalTelemetryFreshnessToSemantics('signal_delayed')).toBe('soft_offline');
    });

    it('maps canonical no_signal to unknown', () => {
      expect(mapCanonicalTelemetryFreshnessToSemantics('no_signal')).toBe('unknown');
    });
  });

  describe('mapping table documentation', () => {
    it('covers all requested AI telemetry semantics', () => {
      const covered = new Set(
        AI_TELEMETRY_SEMANTICS_MAPPING_TABLE.map((row) => row.telemetrySemantics),
      );
      const required: AiEvidenceTelemetrySemantics[] = [
        'live',
        'fresh',
        'standby',
        'stale',
        'soft_offline',
        'offline',
        'unknown',
        'unavailable',
        'not_supported',
        'permission_denied',
      ];
      for (const semantic of required) {
        expect(covered.has(semantic)).toBe(true);
      }
    });
  });

  describe('timestamp priority (delegates to resolver)', () => {
    it('prefers providerObservedAt over fresh receivedAt', () => {
      const result = mapTelemetryToAiEvidenceSemantics(
        baseInput({
          timestampEvidence: {
            providerObservedAt: new Date(hoursAgo(30)).toISOString(),
            receivedAt: new Date(NOW_MS).toISOString(),
          },
          nowMs: NOW_MS,
        }),
      );
      expect(result.canonicalFreshness).toBe('signal_delayed');
      expect(result.telemetrySemantics).toBe('soft_offline');
    });
  });
});
