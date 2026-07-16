import { describe, expect, it } from 'vitest';
import type { TireHealthSummaryResponse } from '../../lib/api';
import {
  formatLowestTreadLine,
  formatTireQuickNextMeasurementLabel,
  tireDefaultAssumptionWarning,
  tireForecastBadgeLabel,
  tireHasTrackableData,
  tireLowestTreadLabel,
  tireRemainingKmLabel,
  tireUiStatus,
  wheelIsMeasured,
  wheelMeasurementBadge,
} from './tire-health-detail-ui';

function summary(overrides: Partial<TireHealthSummaryResponse> = {}): TireHealthSummaryResponse {
  return {
    overallPercent: 70,
    overallRemainingKm: 12000,
    healthStatus: 'GOOD',
    confidenceScore: 65,
    confidenceLabel: 'Medium',
    worstTirePosition: 'FL',
    worstTirePercent: 72,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: null,
    totalKmOnSet: 5000,
    wearRateMmPer1000km: 0.2,
    alerts: [],
    hasActiveSet: true,
    displayTreadMm: 6.5,
    displayMode: 'ESTIMATED',
    overallStatus: 'GOOD',
    evidencePresentation: {
      uiStatus: 'LIMITED_DATA',
      uiStatusLabelDe: 'Eingeschränkte Daten',
      uiStatusLabelEn: 'Limited data',
      treadLines: [],
      lowestTread: {
        position: 'FL',
        axle: 'front',
        valueMm: 8,
        provenance: 'DEFAULT_ASSUMPTION',
        sourceCode: 'DEFAULT_ASSUMPTION',
        sourceLabelDe: 'Standardannahme',
        sourceLabelEn: 'Default assumption',
        measuredAt: null,
        confidence: 'LOW',
        isDefaultAssumption: true,
        displayLabelDe: 'Ausgangsprofil geschätzt – Standardannahme 8,0 mm',
        displayLabelEn: 'Estimated starting profile – standard assumption 8.0 mm',
      },
      remainingKm: {
        reliable: false,
        displayDe: 'noch nicht belastbar',
        displayEn: 'not yet reliable',
        exactKm: null,
        bandMinKm: null,
        bandMaxKm: null,
        reasonDe: 'Kilometeranker fehlt',
        reasonEn: 'Missing anchor',
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
      structuredActions: [{ code: 'MEASURE_TREAD', labelDe: 'Profiltiefe messen', labelEn: 'Measure tread depth', priority: 10 }],
      defaultAssumptionWarningDe: 'Ausgangsprofil geschätzt – Standardannahme 8,0 mm. Bitte messen.',
      defaultAssumptionWarningEn: 'Estimated starting profile – standard assumption 8.0 mm. Please measure.',
    },
    ...overrides,
  };
}

describe('tire-health-detail-ui', () => {
  it('never labels default assumption as measured', () => {
    const s = summary();
    expect(tireLowestTreadLabel(s)).toContain('Standardannahme');
    expect(tireLowestTreadLabel(s)).not.toContain('Gemessen');
    expect(tireForecastBadgeLabel(s)).toBe('Standardannahme');
  });

  it('uses backend remaining km presentation without fake precision', () => {
    const s = summary();
    expect(tireRemainingKmLabel(s)).toBe('noch nicht belastbar');
    expect(tireRemainingKmLabel(s, 'en')).toBe('not yet reliable');
  });

  it('tracks data from hasActiveSet not overallPercent', () => {
    expect(tireHasTrackableData(summary({ overallPercent: null as unknown as number }))).toBe(true);
    expect(tireHasTrackableData(null)).toBe(false);
  });

  it('reads ui status from evidence presentation', () => {
    expect(tireUiStatus(summary())).toBe('LIMITED_DATA');
  });

  it('omits ca. for measured lowest tread', () => {
    const line = formatLowestTreadLine(8.1, 'front right', 'MEASURED');
    expect(line.value).toBe('8.1 mm');
    expect(line.prefix).toContain('gemessene');
  });

  it('formats next measurement from ui status', () => {
    expect(
      formatTireQuickNextMeasurementLabel(
        summary({ evidencePresentation: { ...summary().evidencePresentation!, uiStatus: 'MEASUREMENT_REQUIRED' } }),
      ),
    ).toBe('erforderlich');
  });

  it('detects measured wheels from lastMeasuredMm', () => {
    const wheel = {
      position: 'FL',
      treadMm: 7,
      lastMeasuredMm: 7,
    } as Parameters<typeof wheelIsMeasured>[0];
    expect(wheelIsMeasured(wheel)).toBe(true);
    expect(wheelMeasurementBadge(wheel)).toBe('Gemessen');
  });

  it('surfaces default assumption warning from backend', () => {
    expect(tireDefaultAssumptionWarning(summary())).toContain('Standardannahme');
  });
});
