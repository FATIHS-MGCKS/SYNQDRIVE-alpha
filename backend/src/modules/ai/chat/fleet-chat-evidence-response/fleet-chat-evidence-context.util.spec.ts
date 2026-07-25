import {
  collectInconsistencyFlags,
  collectWarnings,
  getHealthData,
  getLocationData,
  getOverdueData,
  hasPermissionDenied,
  resolveDataFreshness,
  resolveVehicleRef,
} from './fleet-chat-evidence-context.util';
import {
  FLEET_AI_ORG_ID,
  makeFleetRoute,
  makeFleetToolRecord,
} from '../../__fixtures__/fleet-ai-test.fixtures';

describe('fleet-chat-evidence-context.util — contract', () => {
  describe('resolveDataFreshness priority', () => {
    it('prefers location freshness over health when location tool present', () => {
      const records = [
        makeFleetToolRecord('get_vehicle_location', {
          freshness: 'live',
          observedAt: '2026-07-24T12:00:00.000Z',
          isLastKnownLocation: false,
        }),
        makeFleetToolRecord('get_vehicle_health_summary', {
          limitedData: true,
          lastUpdatedAt: '2026-07-24T08:00:00.000Z',
        }),
      ];

      const freshness = resolveDataFreshness(records);
      expect(freshness.freshness).toBe('live');
      expect(freshness.isLastKnown).toBe(false);
      expect(freshness.label).toBe('live_position');
      expect(freshness.observedAt).toBe('2026-07-24T12:00:00.000Z');
    });

    it('uses health limited_data when no location', () => {
      const records = [
        makeFleetToolRecord('get_vehicle_health_summary', {
          limitedData: true,
          lastUpdatedAt: '2026-07-24T09:00:00.000Z',
        }),
      ];

      const freshness = resolveDataFreshness(records);
      expect(freshness.freshness).toBe('signal_delayed');
      expect(freshness.isLastKnown).toBe(true);
      expect(freshness.label).toBe('limited_data');
    });

    it('uses overdue latestKnownLocation when only overdue tool present', () => {
      const records = [
        makeFleetToolRecord('explain_overdue_return', {
          latestKnownLocation: {
            freshness: 'offline',
            observedAt: '2026-07-24T07:00:00.000Z',
            isLastKnownLocation: true,
          },
        }),
      ];

      const freshness = resolveDataFreshness(records);
      expect(freshness.freshness).toBe('offline');
      expect(freshness.isLastKnown).toBe(true);
      expect(freshness.label).toBe('booking_context');
    });

    it('returns not_applicable when no tool data', () => {
      expect(resolveDataFreshness([])).toEqual({
        freshness: 'not_applicable',
        observedAt: null,
        isLastKnown: false,
        label: null,
      });
    });
  });

  describe('collectInconsistencyFlags', () => {
    it('aggregates flags from tool outcome data', () => {
      const records = [
        makeFleetToolRecord('get_vehicle_health_summary', {
          inconsistencyFlags: ['domain_status_inconsistent', 'telemetry_vs_location'],
        }),
        makeFleetToolRecord('get_vehicle_location', {
          inconsistencyFlags: ['telemetry_vs_location'],
        }),
      ];

      expect([...collectInconsistencyFlags(records)].sort()).toEqual([
        'domain_status_inconsistent',
        'telemetry_vs_location',
      ]);
    });
  });

  describe('hasPermissionDenied', () => {
    it('detects permission_denied in tool errors', () => {
      const records = [
        makeFleetToolRecord(
          'get_vehicle_health_summary',
          null,
          [
            {
              code: 'permission_denied',
              publicMessage: 'Forbidden',
              severity: 'error',
              retryPolicy: 'non_retryable',
              httpStatus: 403,
              auditEvent: 'ai.domain_query.permission_denied',
              maskEntityExistence: true,
              blockLlmInference: true,
              diagnostics: {},
            },
          ],
        ),
      ];
      expect(hasPermissionDenied(records)).toBe(true);
    });
  });

  describe('resolveVehicleRef', () => {
    it('prefers location display fields over health', () => {
      const records = [
        makeFleetToolRecord('get_vehicle_location', {
          displayName: 'Loc Name',
          licensePlate: 'WOB-L 7503',
        }),
        makeFleetToolRecord('get_vehicle_health_summary', {
          displayName: 'Health Name',
          licensePlate: 'B-AB 1234',
        }),
      ];

      expect(resolveVehicleRef(records)).toEqual({
        displayName: 'Loc Name',
        licensePlate: 'WOB-L 7503',
      });
    });
  });

  describe('typed getters', () => {
    it('returns null when tool missing', () => {
      expect(getLocationData([])).toBeNull();
      expect(getHealthData([])).toBeNull();
      expect(getOverdueData([])).toBeNull();
    });

    it('returns typed data when present', () => {
      const records = [
        makeFleetToolRecord('get_vehicle_location', {
          latitude: 52.1,
          longitude: 10.7,
          freshness: 'live',
        }),
      ];
      expect(getLocationData(records)?.latitude).toBe(52.1);
    });
  });

  describe('collectWarnings', () => {
    it('merges outcome warnings and data.warnings', () => {
      const record = makeFleetToolRecord('get_vehicle_health_summary', {
        warnings: ['data.limited'],
      });
      const mergedRecord = {
        ...record,
        outcome: {
          ...record.outcome,
          warnings: ['ai.domain_tool:partial', ...record.outcome.warnings],
        },
      };
      const warnings = collectWarnings([mergedRecord]);
      expect(warnings).toContain('ai.domain_tool:partial');
      expect(warnings).toContain('data.limited');
    });
  });
});
