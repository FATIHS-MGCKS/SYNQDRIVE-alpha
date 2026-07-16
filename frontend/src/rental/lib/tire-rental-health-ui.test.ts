import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  isTireRentalHardBlockedFromHealth,
  summarizeTireRentalHealthForUi,
  tireEvidenceTypeLabel,
} from './tire-rental-health-ui';

function healthWithTireModel(
  tire_read_model: NonNullable<
    VehicleHealthResponse['modules']['tires']['tire_read_model']
  >,
): VehicleHealthResponse {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'critical',
    rental_blocked: true,
    blocking_reasons: ['Reifen: Test'],
    generated_at: '2026-07-16T12:00:00.000Z',
    modules: {
      battery: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
      tires: {
        state: tire_read_model.overallStatus,
        reason: tire_read_model.primaryReason,
        last_updated_at: tire_read_model.lastUpdatedAt,
        data_stale: tire_read_model.dataStale,
        evidence_type:
          tire_read_model.evidenceType === 'measured' ? 'measured' : 'estimated',
        tire_read_model,
      },
      brakes: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
      error_codes: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
      service_compliance: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
      complaints: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
      vehicle_alerts: {
        state: 'good',
        reason: 'ok',
        last_updated_at: null,
        data_stale: false,
      },
    },
  };
}

const baseModel = {
  wearEvidence: {
    displayMode: 'MEASURED',
    lowestTreadMm: 1.5,
    lowestTreadPosition: 'front_left',
    overallWearStatus: 'CRITICAL',
    measuredAt: '2026-07-10T10:00:00.000Z',
    freshness: 'fresh',
    isDefaultAssumption: false,
    confidence: 'HIGH',
  },
  pressureEvidence: {
    sourceType: 'DIMO',
    sourceLabel: 'dimo',
    overallPressureStatus: 'OK',
    tpmsWarning: null,
    freshness: 'fresh',
    lastUpdatedAt: '2026-07-16T13:00:00.000Z',
    perWheelIssue: false,
  },
  specEvidence: {
    pressureSpecSource: 'DOOR_PLACARD',
    pressureSpecConfidence: 98,
    wearFactorEligible: true,
    pressureSpecMissingLabel: null,
  },
  measurementFreshness: 'fresh',
  pressureFreshness: 'fresh',
  overallStatus: 'critical' as const,
  confidence: 'HIGH',
  reviewRequirement: 'NONE' as const,
  rentalBlockingEvidence: {
    action: 'HARD_BLOCK' as const,
    reasonCode: 'TREAD_MEASURED_BELOW_LEGAL_MIN' as const,
    source: 'tire_measurement',
    value: 1.5,
    threshold: 1.6,
    timestamp: '2026-07-10T10:00:00.000Z',
    setupId: 'setup-1',
    message: 'Gemessene Profiltiefe 1.5 mm ≤ gesetzliches Minimum 1.6 mm',
  },
  structuredReasonCodes: ['TREAD_MEASURED_BELOW_LEGAL_MIN' as const],
  activeReviewOverride: null,
  primaryReason: 'Gemessene Profiltiefe 1.5 mm ≤ gesetzliches Minimum 1.6 mm',
  lastUpdatedAt: '2026-07-16T13:00:00.000Z',
  dataStale: false,
  source: 'dimo',
  evidenceType: 'measured',
};

describe('tire-rental-health-ui', () => {
  it('detects hard block from canonical read model', () => {
    const health = healthWithTireModel(baseModel);
    expect(isTireRentalHardBlockedFromHealth(health)).toBe(true);
    const summary = summarizeTireRentalHealthForUi(health);
    expect(summary.blocked).toBe(true);
    expect(summary.evidenceLabel).toBe('Gemessen');
  });

  it('does not treat estimated critical as measured', () => {
    const health = healthWithTireModel({
      ...baseModel,
      evidenceType: 'estimated',
      wearEvidence: { ...baseModel.wearEvidence, displayMode: 'ESTIMATED' },
      rentalBlockingEvidence: null,
      overallStatus: 'warning',
      reviewRequirement: 'REVIEW_REQUIRED',
      structuredReasonCodes: ['TREAD_ESTIMATED_CRITICAL_HIGH_CONF'],
      primaryReason: 'Geschätzte Profiltiefe kritisch — Messung vor Vermietung erforderlich',
    });
    expect(isTireRentalHardBlockedFromHealth(health)).toBe(false);
    expect(tireEvidenceTypeLabel(health.modules.tires)).toBe('Geschätzt');
    expect(summarizeTireRentalHealthForUi(health).reviewLabel).toBe(
      'Prüfung erforderlich',
    );
  });

  it('override suppresses hard block in UI summary', () => {
    const health = healthWithTireModel({
      ...baseModel,
      activeReviewOverride: {
        id: 'ov-1',
        reason: 'Werkstatt-Freigabe',
        grantedByUserId: 'u-1',
        expiresAt: '2026-07-20T00:00:00.000Z',
        createdAt: '2026-07-16T10:00:00.000Z',
      },
      rentalBlockingEvidence: null,
      overallStatus: 'warning',
    });
    expect(isTireRentalHardBlockedFromHealth(health)).toBe(false);
  });
});
