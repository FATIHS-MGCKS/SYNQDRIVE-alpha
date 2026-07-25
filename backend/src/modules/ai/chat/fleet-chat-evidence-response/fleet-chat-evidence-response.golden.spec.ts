import { MembershipRole, VehicleStatus } from '@prisma/client';
import { composeFleetChatEvidenceResponse } from './fleet-chat-evidence-response.composer';
import type { FleetChatRouteResult } from '../../routing/fleet-chat-intent.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';

const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CORR_ID = 'corr-golden-020';

function makeRoute(overrides: Partial<FleetChatRouteResult> = {}): FleetChatRouteResult {
  return {
    detectedIntents: ['VEHICLE_LOCATION'],
    primaryIntent: 'VEHICLE_LOCATION',
    vehicleReferences: [
      {
        vehicleId: VEHICLE_ID,
        displayName: 'VW Tiguan 2021',
        licensePlate: 'WOB-L 7503',
        matchType: 'license_plate_exact',
        confidence: 0.95,
        source: 'hardened_resolver',
      },
    ],
    bookingReferences: [],
    requiredTools: ['get_vehicle_location'],
    ambiguities: [],
    clarificationNeeded: null,
    confidence: 0.9,
    language: 'de',
    securityFlags: [],
    vehicleResolution: {
      resolvedVehicleId: VEHICLE_ID,
      displayName: 'VW Tiguan 2021',
      licensePlate: 'WOB-L 7503',
      matchType: 'license_plate_exact',
      confidence: 0.95,
      ambiguity: { isAmbiguous: false, reason: null, candidates: [] },
      allowedDataScope: {
        inOrganization: true,
        inStationScope: true,
        hasDimoTelemetry: true,
        operational: true,
        vehicleStatus: VehicleStatus.AVAILABLE,
      },
    },
    intentScores: [],
    usedLlmClassification: false,
    sanitizedMessage: 'test',
    ...overrides,
  };
}

function makeToolRecord(
  toolName: FleetChatToolExecutionRecord['toolName'],
  data: Record<string, unknown>,
): FleetChatToolExecutionRecord {
  return {
    toolName,
    success: true,
    durationMs: 2,
    outcome: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      partial: false,
      data,
      evidence: [],
      errors: [],
      warnings: [],
      allowLlmInference: true,
    },
  };
}

describe('fleet-chat-evidence-response — golden', () => {
  it('golden Q1: Wo befindet sich das Fahrzeug? (live location)', () => {
    const response = composeFleetChatEvidenceResponse({
      correlationId: CORR_ID,
      userMessage: 'Wo befindet sich das Fahrzeug WOB-L 7503?',
      language: 'de',
      route: makeRoute({ primaryIntent: 'VEHICLE_LOCATION' }),
      toolRecords: [
        makeToolRecord('get_vehicle_location', {
          displayName: 'VW Tiguan 2021',
          licensePlate: 'WOB-L 7503',
          latitude: 52.42345,
          longitude: 10.78654,
          observedAt: '2026-07-25T10:00:00.000Z',
          freshness: 'live',
          isLastKnownLocation: false,
          source: 'vehicle_latest_state',
          availability: 'available',
        }),
      ],
      mergedEvidence: [],
      partial: false,
      allowLlmInference: true,
      llmRawText:
        'Live-Position für WOB-L 7503: 52.42, 10.79. Beobachtet 2026-07-25T10:00:00.000Z (Frische: live).',
    });

    expect(response.responseType).toBe('LOCATION_SUMMARY');
    expect(response.text).toContain('Live-Position');
    expect(response.text).toContain('52.42');
    expect(response.text).not.toContain(VEHICLE_ID);
    expect(response.dataFreshness.freshness).toBe('live');
    expect(response.dataFreshness.isLastKnown).toBe(false);
    expect(response.sources[0]?.tool).toBe('get_vehicle_location');
    expect(response.partial).toBe(false);
    expect(response.correlationId).toBe(CORR_ID);
    expect(response.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('golden Q2: Wie ist die Fahrzeuggesundheit?', () => {
    const response = composeFleetChatEvidenceResponse({
      correlationId: CORR_ID,
      userMessage: 'Wie ist die Fahrzeuggesundheit von WOB-L 7503?',
      language: 'de',
      route: makeRoute({
        primaryIntent: 'VEHICLE_HEALTH',
        detectedIntents: ['VEHICLE_HEALTH'],
        requiredTools: ['get_vehicle_health_summary'],
      }),
      toolRecords: [
        makeToolRecord('get_vehicle_health_summary', {
          displayName: 'VW Tiguan 2021',
          licensePlate: 'WOB-L 7503',
          overallStatus: 'warning',
          limitedData: true,
          lastUpdatedAt: '2026-07-25T09:30:00.000Z',
          readyToRentBlockers: ['CRITICAL_TASK_OPEN'],
          rentalBlocked: true,
          warnings: ['limited_data_coverage'],
        }),
      ],
      mergedEvidence: [],
      partial: true,
      allowLlmInference: true,
      llmRawText:
        'Gesundheit für WOB-L 7503: Limited Data — Gesamtstatus warning. Blocker: CRITICAL_TASK_OPEN.',
    });

    expect(response.responseType).toBe('HEALTH_SUMMARY');
    expect(response.text).toContain('Limited Data');
    expect(response.text).toContain('warning');
    expect(response.partial).toBe(true);
    expect(response.warnings).toContain('limited_data_coverage');
    expect(response.actions?.[0]?.kind).toBe('review_health_blockers');
  });

  it('golden Q3: Warum ist die Rückgabe überfällig?', () => {
    const response = composeFleetChatEvidenceResponse({
      correlationId: CORR_ID,
      userMessage: 'Warum ist die Rückgabe überfällig?',
      language: 'de',
      route: makeRoute({
        primaryIntent: 'OVERDUE_RETURN_EXPLANATION',
        detectedIntents: ['OVERDUE_RETURN_EXPLANATION'],
        requiredTools: ['explain_overdue_return'],
      }),
      toolRecords: [
        makeToolRecord('explain_overdue_return', {
          displayName: 'VW Tiguan 2021',
          licensePlate: 'WOB-L 7503',
          returnOverdue: true,
          reasonCodes: ['RETURN_DEADLINE_PASSED', 'RETURN_NOT_COMPLETED'],
          explanation:
            'Die Rückgabe der aktiven Buchung ist seit dem geplanten endDate überfällig; Rückgabe-Handover fehlt.',
          isCurrentCauseBooking: true,
        }),
      ],
      mergedEvidence: [],
      partial: false,
      allowLlmInference: true,
      llmRawText:
        'Die Rückgabe der aktiven Buchung ist seit dem geplanten endDate überfällig; Rückgabe-Handover fehlt. (Ursachen: RETURN_DEADLINE_PASSED, RETURN_NOT_COMPLETED).',
    });

    expect(response.responseType).toBe('OVERDUE_EXPLANATION');
    expect(response.text).toContain('überfällig');
    expect(response.text).toContain('RETURN_DEADLINE_PASSED');
    expect(response.actions?.[0]?.kind).toBe('review_return_process');
  });

  it('uses deterministic fallback when LLM output is not grounded', () => {
    const response = composeFleetChatEvidenceResponse({
      correlationId: CORR_ID,
      userMessage: 'Wo ist WOB-L 7503?',
      language: 'de',
      route: makeRoute(),
      toolRecords: [
        makeToolRecord('get_vehicle_location', {
          displayName: 'VW Tiguan 2021',
          licensePlate: 'WOB-L 7503',
          latitude: 52.42,
          longitude: 10.78,
          observedAt: '2026-07-25T10:00:00.000Z',
          freshness: 'live',
          isLastKnownLocation: false,
          source: 'vehicle_latest_state',
          availability: 'available',
        }),
      ],
      mergedEvidence: [],
      partial: false,
      allowLlmInference: true,
      llmRawText: 'Das Fahrzeug steht irgendwo bei 99.99, 99.99 — alles in Ordnung.',
    });

    expect(response.usedDeterministicFallback).toBe(true);
    expect(response.text).toContain('Live-Position');
    expect(response.text).not.toContain('99.99');
  });
});
