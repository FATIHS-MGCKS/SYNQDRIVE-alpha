import {
  buildEvidenceLlmUserContext,
  validateLlmVisibleText,
} from './fleet-chat-evidence-llm-input.builder';
import {
  FLEET_AI_CORR_ID,
  FLEET_AI_VEHICLE_TIGUAN_A,
  makeFleetRoute,
  makeFleetToolRecord,
} from '../../__fixtures__/fleet-ai-test.fixtures';
import type { FleetChatEvidenceComposeInput } from './fleet-chat-evidence-response.types';

function makeComposeInput(
  overrides: Partial<FleetChatEvidenceComposeInput> = {},
): FleetChatEvidenceComposeInput {
  return {
    correlationId: FLEET_AI_CORR_ID,
    userMessage: 'Wo steht WOB-L 7503?',
    language: 'de',
    route: makeFleetRoute(),
    toolRecords: [],
    mergedEvidence: [],
    partial: false,
    allowLlmInference: true,
    ...overrides,
  };
}

describe('validateLlmVisibleText — hallucination guards', () => {
  describe('LOCATION_SUMMARY', () => {
    it('flags last_known_labeled_live when text claims live/current', () => {
      const input = makeComposeInput({
        toolRecords: [
          makeFleetToolRecord('get_vehicle_location', {
            latitude: 52.42345,
            longitude: 10.78654,
            isLastKnownLocation: true,
            freshness: 'offline',
          }),
        ],
      });

      const result = validateLlmVisibleText(
        input,
        'Live-Position für WOB-L 7503 aktuell.',
        'LOCATION_SUMMARY',
      );
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('last_known_labeled_live');
    });

    it('flags location_coords_not_grounded when coords absent from text', () => {
      const input = makeComposeInput({
        toolRecords: [
          makeFleetToolRecord('get_vehicle_location', {
            latitude: 52.42345,
            longitude: 10.78654,
            isLastKnownLocation: false,
            freshness: 'live',
          }),
        ],
      });

      const result = validateLlmVisibleText(
        input,
        'Das Fahrzeug steht irgendwo in Wolfsburg.',
        'LOCATION_SUMMARY',
      );
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('location_coords_not_grounded');
    });

    it('accepts grounded live location text', () => {
      const input = makeComposeInput({
        toolRecords: [
          makeFleetToolRecord('get_vehicle_location', {
            latitude: 52.42345,
            longitude: 10.78654,
            isLastKnownLocation: false,
            freshness: 'live',
          }),
        ],
      });

      const result = validateLlmVisibleText(
        input,
        'Live-Position: 52.42, 10.79 (Frische: live).',
        'LOCATION_SUMMARY',
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('HEALTH_SUMMARY', () => {
    it('flags limited_data_read_as_ok', () => {
      const input = makeComposeInput({
        toolRecords: [
          makeFleetToolRecord('get_vehicle_health_summary', {
            limitedData: true,
            overallStatus: 'unknown',
          }),
        ],
      });

      const result = validateLlmVisibleText(
        input,
        'Alles in Ordnung, keine Probleme.',
        'HEALTH_SUMMARY',
      );
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('limited_data_read_as_ok');
    });
  });

  describe('OVERDUE_EXPLANATION', () => {
    it('flags overdue_explanation_not_grounded', () => {
      const input = makeComposeInput({
        toolRecords: [
          makeFleetToolRecord('explain_overdue_return', {
            explanation: 'Rückgabefrist überschritten seit 2 Stunden.',
            returnOverdue: true,
          }),
        ],
      });

      const result = validateLlmVisibleText(
        input,
        'Das Fahrzeug ist überfällig ohne Details.',
        'OVERDUE_EXPLANATION',
      );
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('overdue_explanation_not_grounded');
    });
  });

  describe('internal_id_leak', () => {
    it('flags internal UUIDs in visible text', () => {
      const input = makeComposeInput();
      const result = validateLlmVisibleText(
        input,
        `Vehicle ${FLEET_AI_VEHICLE_TIGUAN_A} is overdue.`,
        'LOCATION_SUMMARY',
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.startsWith('internal_id_leak:'))).toBe(true);
    });

    it('rejects empty output', () => {
      const input = makeComposeInput();
      expect(validateLlmVisibleText(input, '   ', 'DIRECT_ANSWER').issues).toContain(
        'empty_output',
      );
    });
  });

  describe('buildEvidenceLlmUserContext', () => {
    it('does not include internal ids in tool data payload', () => {
      const input = makeComposeInput({
        route: makeFleetRoute({
          vehicleReferences: [],
        }),
        toolRecords: [
          makeFleetToolRecord('get_vehicle_location', {
            vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
            bookingId: 'booking-secret',
            customerId: 'cust-secret',
            organizationId: 'org-secret',
            latitude: 52.1,
            longitude: 10.7,
          }),
        ],
      });

      const context = buildEvidenceLlmUserContext(input, 'LOCATION_SUMMARY');
      const toolsSection = context.split('"tools"')[1] ?? '';
      expect(toolsSection).not.toContain('booking-secret');
      expect(toolsSection).not.toContain('cust-secret');
      expect(toolsSection).not.toContain('org-secret');
      expect(toolsSection).not.toContain(FLEET_AI_VEHICLE_TIGUAN_A);
      expect(toolsSection).toContain('latitude');
    });
  });
});
