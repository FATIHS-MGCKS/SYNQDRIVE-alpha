import {
  buildDeterministicFallback,
  buildHealthSummaryFallback,
  buildLocationSummaryFallback,
  buildOverdueExplanationFallback,
} from './fleet-chat-evidence-response.fallback';
import {
  FLEET_AI_CORR_ID,
  makeFleetRoute,
  makeFleetToolRecord,
} from '../../__fixtures__/fleet-ai-test.fixtures';
import type { FleetChatEvidenceComposeInput } from './fleet-chat-evidence-response.types';

function makeInput(
  overrides: Partial<FleetChatEvidenceComposeInput> = {},
): FleetChatEvidenceComposeInput {
  return {
    correlationId: FLEET_AI_CORR_ID,
    userMessage: 'test',
    language: 'de',
    route: makeFleetRoute(),
    toolRecords: [],
    mergedEvidence: [],
    partial: false,
    allowLlmInference: true,
    ...overrides,
  };
}

describe('fleet-chat-evidence-response.fallback — deterministic contracts', () => {
  describe('buildLocationSummaryFallback', () => {
    it('includes observed timestamp and warns on last-known', () => {
      const text = buildLocationSummaryFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('get_vehicle_location', {
              licensePlate: 'WOB-L 7503',
              latitude: 52.42345,
              longitude: 10.78654,
              observedAt: '2026-07-24T10:00:00.000Z',
              freshness: 'offline',
              isLastKnownLocation: true,
              availability: 'partial',
              source: 'vehicle_latest_state',
            }),
          ],
        }),
      );

      expect(text).toContain('Letzte bekannte Position');
      expect(text).toContain('2026-07-24T10:00:00.000Z');
      expect(text).toContain('WOB-L 7503');
      expect(text).toMatch(/Nicht als aktuell|Do not present as current/i);
      expect(text).not.toMatch(/Live-Position/);
    });

    it('labels live position when freshness is live', () => {
      const text = buildLocationSummaryFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('get_vehicle_location', {
              licensePlate: 'WOB-L 7503',
              latitude: 52.42,
              longitude: 10.78,
              observedAt: '2026-07-24T10:00:00.000Z',
              freshness: 'live',
              isLastKnownLocation: false,
              source: 'vehicle_latest_state',
            }),
          ],
        }),
      );

      expect(text).toContain('Live-Position');
      expect(text).toContain('52.42000');
    });

    it('handles unavailable location without inventing coords', () => {
      const text = buildLocationSummaryFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('get_vehicle_location', {
              licensePlate: 'WOB-L 7503',
              availability: 'unavailable',
            }),
          ],
        }),
      );
      expect(text).toMatch(/keine Position|No position could be loaded/i);
      expect(text).not.toMatch(/\d{2}\.\d{5}/);
    });
  });

  describe('buildHealthSummaryFallback', () => {
    it('names Limited Data gaps and does not claim all clear', () => {
      const text = buildHealthSummaryFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('get_vehicle_health_summary', {
              licensePlate: 'WOB-L 7503',
              limitedData: true,
              overallStatus: 'unknown',
              lastUpdatedAt: '2026-07-24T08:00:00.000Z',
              readyToRentBlockers: ['tire_stale'],
            }),
          ],
        }),
      );

      expect(text).toContain('Limited Data');
      expect(text).toMatch(/Lücken|gaps/i);
      expect(text).toMatch(/fehlende|missing/);
      expect(text).toContain('tire_stale');
    });
  });

  describe('buildOverdueExplanationFallback', () => {
    it('includes grounded explanation and reason codes', () => {
      const text = buildOverdueExplanationFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('explain_overdue_return', {
              licensePlate: 'WOB-L 7503',
              explanation: 'Rückgabe seit 3 Stunden überfällig.',
              reasonCodes: ['RETURN_DEADLINE_PASSED'],
            }),
          ],
        }),
      );

      expect(text).toContain('Rückgabe seit 3 Stunden');
      expect(text).toContain('RETURN_DEADLINE_PASSED');
    });
  });

  describe('buildDeterministicFallback — response types', () => {
    it('returns PERMISSION_RESTRICTED copy', () => {
      const text = buildDeterministicFallback(
        makeInput({ language: 'de' }),
        'PERMISSION_RESTRICTED',
      );
      expect(text).toContain('Berechtigungen');
    });

    it('returns INCONSISTENT_STATE with flags', () => {
      const text = buildDeterministicFallback(
        makeInput({
          toolRecords: [
            makeFleetToolRecord('get_vehicle_health_summary', {
              inconsistencyFlags: ['domain_status_inconsistent'],
            }),
          ],
        }),
        'INCONSISTENT_STATE',
      );
      expect(text).toContain('domain_status_inconsistent');
    });

    it('returns PARTIAL_DATA copy', () => {
      const text = buildDeterministicFallback(makeInput({ language: 'en' }), 'PARTIAL_DATA');
      expect(text).toContain('partial data');
    });

    it('returns AMBIGUITY_QUESTION from route clarification', () => {
      const text = buildDeterministicFallback(
        makeInput({
          route: makeFleetRoute({
            clarificationNeeded: {
              kind: 'vehicle_ambiguous',
              messageDe: 'Bitte Kennzeichen nennen.',
              messageEn: 'Please specify plate.',
              candidatePlates: ['A', 'B'],
            },
          }),
        }),
        'AMBIGUITY_QUESTION',
      );
      expect(text).toBe('Bitte Kennzeichen nennen.');
    });

    it('returns TEMPORARY_UNAVAILABLE safe fallback', () => {
      const text = buildDeterministicFallback(makeInput(), 'TEMPORARY_UNAVAILABLE');
      expect(text).toMatch(/nicht verarbeiten|could not process/i);
    });
  });
});
