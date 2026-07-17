import { describe, expect, it } from 'vitest';
import { tireEscalationLevel } from '../components/vehicle-insights-logic';
import type { TireHealthSummaryResponse } from '../../lib/api';

function tires(overrides: Partial<TireHealthSummaryResponse> = {}): TireHealthSummaryResponse {
  return {
    overallPercent: 70,
    overallRemainingKm: 12000,
    healthStatus: 'GOOD',
    confidenceScore: 65,
    confidenceLabel: 'Medium',
    worstTirePosition: null,
    worstTirePercent: null,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: null,
    totalKmOnSet: 0,
    wearRateMmPer1000km: null,
    alerts: [],
    hasActiveSet: true,
    displayTreadMm: 6.5,
    overallStatus: 'GOOD',
    actionState: 'OBSERVE',
    evidencePresentation: {
      uiStatus: 'GOOD',
      uiStatusLabelDe: 'Gut',
      uiStatusLabelEn: 'Good',
      treadLines: [],
      lowestTread: null,
      remainingKm: {
        reliable: true,
        displayDe: '12.000 km',
        displayEn: '12,000 km',
        exactKm: 12000,
        bandMinKm: null,
        bandMaxKm: null,
        reasonDe: null,
        reasonEn: null,
      },
      lastTreadMeasurementAt: null,
      lastPressureValueBar: null,
      lastPressureSource: null,
      pressureFreshness: 'no_data',
      modelVersion: 'tire-wear-v2',
      modelCalculatedAt: null,
      tireSpecSource: null,
      tireSpecSourceLabelDe: 'Unbekannt',
      tireSpecSourceLabelEn: 'Unknown',
      structuredActions: [],
      defaultAssumptionWarningDe: null,
      defaultAssumptionWarningEn: null,
    },
    ...overrides,
  };
}

describe('vehicle-insights-logic tire escalation', () => {
  it('does not use overallPercent thresholds', () => {
    expect(
      tireEscalationLevel(
        tires({
          overallPercent: 5,
          evidencePresentation: {
            ...tires().evidencePresentation!,
            uiStatus: 'GOOD',
          },
        }),
      ),
    ).toBe('good');
  });

  it('escalates from backend uiStatus', () => {
    expect(
      tireEscalationLevel(
        tires({
          evidencePresentation: {
            ...tires().evidencePresentation!,
            uiStatus: 'CRITICAL',
          },
        }),
      ),
    ).toBe('critical');
  });

  it('escalates replace actionState', () => {
    expect(tireEscalationLevel(tires({ actionState: 'REPLACE' }))).toBe('critical');
  });
});
