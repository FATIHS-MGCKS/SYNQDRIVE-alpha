import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  getBrakeRentalReadModel,
  isBrakeRentalHardBlockedFromHealth,
  summarizeBrakeRentalHealthForUi,
} from './brake-rental-health-ui';

function health(
  brakeReadModel: NonNullable<
    VehicleHealthResponse['modules']['brakes']['brake_read_model']
  >,
): VehicleHealthResponse {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'warning',
    rental_blocked: brakeReadModel.rentalBlockingEvidence?.action === 'HARD_BLOCK',
    blocking_reasons: [],
    modules: {
      battery: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
      tires: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
      brakes: {
        state: 'critical',
        reason: brakeReadModel.primaryReason,
        last_updated_at: brakeReadModel.lastUpdatedAt,
        data_stale: brakeReadModel.dataStale,
        brake_read_model: brakeReadModel,
      },
      error_codes: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
      service_compliance: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
      complaints: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
      vehicle_alerts: { state: 'good', reason: 'ok', last_updated_at: null, data_stale: false },
    },
    generated_at: new Date().toISOString(),
  };
}

const baseReadModel = {
  wearCondition: 'CRITICAL',
  safetyCondition: 'UNKNOWN',
  dataQualityCondition: 'GOOD',
  measurementFreshness: 'fresh',
  modelFreshness: 'fresh',
  activeSafetyEvidence: [],
  confidence: 'HIGH',
  reviewRequirement: 'NONE' as const,
  rentalDecision: 'HARD_BLOCK' as const,
  blockingReasons: ['Gemessen kritisch'],
  rentalBlockingEvidence: {
    action: 'HARD_BLOCK' as const,
    reasonCode: 'WEAR_MEASURED_CRITICAL' as const,
    source: 'brake_measurement',
    value: null,
    threshold: null,
    timestamp: '2026-07-01T00:00:00.000Z',
    message: 'Gemessen kritisch',
    messageEn: 'Measured critical',
  },
  structuredReasonCodes: ['WEAR_MEASURED_CRITICAL' as const],
  activeReviewOverride: null,
  hasWearOrSafetyAlert: true,
  primaryReason: 'Gemessen kritisch',
  primaryReasonEn: 'Measured critical',
  lastMeasurementAt: '2026-07-01T00:00:00.000Z',
  lastSafetyEvidenceAt: null,
  lastModelCalculatedAt: '2026-07-01T00:00:00.000Z',
  lastDataReceivedAt: '2026-07-01T00:00:00.000Z',
  lastUpdatedAt: '2026-07-01T00:00:00.000Z',
  dataStale: false,
  source: 'brake_health',
  evidenceType: 'measured',
};

describe('brake-rental-health-ui', () => {
  it('detects hard block from rental health payload', () => {
    const payload = health(baseReadModel);
    expect(isBrakeRentalHardBlockedFromHealth(payload)).toBe(true);
    expect(getBrakeRentalReadModel(payload.modules.brakes)?.rentalDecision).toBe('HARD_BLOCK');
  });

  it('booking gate and UI summary stay aligned on measured critical', () => {
    const payload = health(baseReadModel);
    const ui = summarizeBrakeRentalHealthForUi(payload);
    expect(ui.blocked).toBe(payload.rental_blocked);
    expect(ui.blockingMessage).toBe(baseReadModel.rentalBlockingEvidence?.message ?? null);
    expect(ui.evidenceLabel).toBe('Gemessen');
  });

  it('estimated critical shows measurement required without hard block', () => {
    const payload = health({
      ...baseReadModel,
      wearCondition: 'WARNING',
      rentalDecision: 'MEASUREMENT_REQUIRED',
      rentalBlockingEvidence: null,
      blockingReasons: [],
      reviewRequirement: 'MEASUREMENT_REQUIRED',
      evidenceType: 'estimated',
      hasWearOrSafetyAlert: true,
    });
    const ui = summarizeBrakeRentalHealthForUi(payload);
    expect(ui.blocked).toBe(false);
    expect(ui.reviewLabel).toBe('Messung erforderlich');
    expect(ui.evidenceLabel).toBe('Geschätzt');
  });
});
