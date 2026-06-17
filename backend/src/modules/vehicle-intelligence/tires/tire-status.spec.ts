import {
  classifyTreadStatus,
  classifyRemainingKmStatus,
  classifyUnevenWear,
  classifySeasonStatus,
  classifyConfidenceLevel,
  confidenceLevelToLabel,
  confidenceLevelToScore,
  resolveDisplayMode,
  classifyMeasurementOverdue,
  classifyTireAgeYears,
  dotAgeYears,
  aggregateTireStatus,
  isAlertableStatus,
  statusToBars,
  legacyHealthStatusToCanonical,
  alertTypeToCode,
} from './tire-status';

// ═══════════════════════════════════════════════════════════════════════════════
//  TREAD STATUS BANDS (season aware, legal minimum always CRITICAL)
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyTreadStatus', () => {
  it('summer/all-season bands: GOOD > 4.0, WATCH > 3.0, WARNING > 1.6, CRITICAL <= 1.6', () => {
    expect(classifyTreadStatus(5.0, 'SUMMER')).toBe('GOOD');
    expect(classifyTreadStatus(4.01, 'SUMMER')).toBe('GOOD');
    expect(classifyTreadStatus(4.0, 'SUMMER')).toBe('WATCH'); // boundary is exclusive on good
    expect(classifyTreadStatus(3.5, 'SUMMER')).toBe('WATCH');
    expect(classifyTreadStatus(3.0, 'SUMMER')).toBe('WARNING'); // boundary is exclusive on watch
    expect(classifyTreadStatus(2.0, 'SUMMER')).toBe('WARNING');
    expect(classifyTreadStatus(1.6, 'SUMMER')).toBe('CRITICAL');
    expect(classifyTreadStatus(1.5, 'SUMMER')).toBe('CRITICAL');
  });

  it('all-season behaves like summer', () => {
    expect(classifyTreadStatus(4.5, 'ALL_SEASON')).toBe('GOOD');
    expect(classifyTreadStatus(3.2, 'ALL_SEASON')).toBe('WATCH');
    expect(classifyTreadStatus(2.0, 'ALL_SEASON')).toBe('WARNING');
  });

  it('winter bands are stricter: GOOD > 5.0, WATCH > 4.0', () => {
    expect(classifyTreadStatus(5.5, 'WINTER')).toBe('GOOD');
    expect(classifyTreadStatus(4.5, 'WINTER')).toBe('WATCH'); // would be GOOD on summer
    expect(classifyTreadStatus(3.5, 'WINTER')).toBe('WARNING');
    expect(classifyTreadStatus(1.6, 'WINTER')).toBe('CRITICAL');
  });

  it('legal minimum (1.6 mm) is CRITICAL regardless of season', () => {
    expect(classifyTreadStatus(1.6, 'SUMMER')).toBe('CRITICAL');
    expect(classifyTreadStatus(1.6, 'WINTER')).toBe('CRITICAL');
    expect(classifyTreadStatus(1.6, 'ALL_SEASON')).toBe('CRITICAL');
    expect(classifyTreadStatus(1.6, null)).toBe('CRITICAL');
  });

  it('unknown season falls back to the default (summer-like) band', () => {
    expect(classifyTreadStatus(4.5, undefined)).toBe('GOOD');
    expect(classifyTreadStatus(3.5, 'WEIRD_VALUE')).toBe('WATCH');
  });

  it('missing tread → UNKNOWN, never a fake status', () => {
    expect(classifyTreadStatus(null, 'SUMMER')).toBe('UNKNOWN');
    expect(classifyTreadStatus(undefined, 'SUMMER')).toBe('UNKNOWN');
    expect(classifyTreadStatus(NaN, 'SUMMER')).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REMAINING KM STATUS
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyRemainingKmStatus', () => {
  it('<= 1000 km CRITICAL, <= 3000 km WARNING, otherwise GOOD', () => {
    expect(classifyRemainingKmStatus(500)).toBe('CRITICAL');
    expect(classifyRemainingKmStatus(1000)).toBe('CRITICAL');
    expect(classifyRemainingKmStatus(2500)).toBe('WARNING');
    expect(classifyRemainingKmStatus(3000)).toBe('WARNING');
    expect(classifyRemainingKmStatus(8000)).toBe('GOOD');
  });

  it('missing → UNKNOWN', () => {
    expect(classifyRemainingKmStatus(null)).toBe('UNKNOWN');
    expect(classifyRemainingKmStatus(undefined)).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  UNEVEN WEAR
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyUnevenWear', () => {
  it('side delta >= 1.0 mm → WARNING (alignment/suspension)', () => {
    expect(classifyUnevenWear(1.1, 0, 0)).toBe('WARNING');
    expect(classifyUnevenWear(0, 1.0, 0)).toBe('WARNING');
  });

  it('side delta >= 0.6 mm → WATCH', () => {
    expect(classifyUnevenWear(0.7, 0, 0)).toBe('WATCH');
  });

  it('axle delta >= 1.2 mm → WATCH (rotation advisable)', () => {
    expect(classifyUnevenWear(0, 0, 1.3)).toBe('WATCH');
  });

  it('small/no deltas → GOOD', () => {
    expect(classifyUnevenWear(0.1, 0.2, 0.3)).toBe('GOOD');
    expect(classifyUnevenWear(null, null, null)).toBe('GOOD');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SEASON SUITABILITY (month-based)
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifySeasonStatus', () => {
  const january = new Date(2025, 0, 15); // month 1 → winter window
  const july = new Date(2025, 6, 15); // month 7 → summer window
  const april = new Date(2025, 3, 15); // month 4 → transition

  it('summer tires in winter → WARNING + mismatch', () => {
    const r = classifySeasonStatus('SUMMER', january);
    expect(r.status).toBe('WARNING');
    expect(r.mismatch).toBe(true);
    expect(r.expectedSeason).toBe('WINTER');
  });

  it('winter tires in summer → WATCH + mismatch (faster wear)', () => {
    const r = classifySeasonStatus('WINTER', july);
    expect(r.status).toBe('WATCH');
    expect(r.mismatch).toBe(true);
    expect(r.expectedSeason).toBe('SUMMER');
  });

  it('all-season is always neutral GOOD', () => {
    expect(classifySeasonStatus('ALL_SEASON', january).status).toBe('GOOD');
    expect(classifySeasonStatus('ALL_SEASON', july).status).toBe('GOOD');
  });

  it('matching season → GOOD without mismatch', () => {
    expect(classifySeasonStatus('SUMMER', july).mismatch).toBe(false);
    expect(classifySeasonStatus('WINTER', january).mismatch).toBe(false);
  });

  it('transition months never raise a mismatch', () => {
    expect(classifySeasonStatus('SUMMER', april).mismatch).toBe(false);
    expect(classifySeasonStatus('WINTER', april).mismatch).toBe(false);
  });

  it('unknown season type → UNKNOWN', () => {
    expect(classifySeasonStatus(null, july).status).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIDENCE LEVEL
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyConfidenceLevel', () => {
  it('recent real measurement (<=30d, <=3000km) → HIGH', () => {
    expect(
      classifyConfidenceLevel({ hasMeasurement: true, measurementAgeDays: 10, kmSinceMeasurement: 500, hasWearBaseline: true }),
    ).toBe('HIGH');
  });

  it('older but plausible measurement → MEDIUM', () => {
    expect(
      classifyConfidenceLevel({ hasMeasurement: true, measurementAgeDays: 120, kmSinceMeasurement: 8000, hasWearBaseline: true }),
    ).toBe('MEDIUM');
  });

  it('measurement beyond medium gates → LOW', () => {
    expect(
      classifyConfidenceLevel({ hasMeasurement: true, measurementAgeDays: 400, kmSinceMeasurement: 30000, hasWearBaseline: true }),
    ).toBe('LOW');
  });

  it('no measurement but a wear baseline (pure estimate) → LOW', () => {
    expect(
      classifyConfidenceLevel({ hasMeasurement: false, measurementAgeDays: null, kmSinceMeasurement: null, hasWearBaseline: true }),
    ).toBe('LOW');
  });

  it('no measurement and no baseline → UNKNOWN (no false certainty)', () => {
    expect(
      classifyConfidenceLevel({ hasMeasurement: false, measurementAgeDays: null, kmSinceMeasurement: null, hasWearBaseline: false }),
    ).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DISPLAY MODE (measured vs estimated honesty)
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveDisplayMode', () => {
  it('measured state → MEASURED', () => {
    expect(resolveDisplayMode('measured', true)).toBe('MEASURED');
  });

  it('estimated/mixed with baseline → ESTIMATED', () => {
    expect(resolveDisplayMode('estimated', true)).toBe('ESTIMATED');
    expect(resolveDisplayMode('mixed', true)).toBe('ESTIMATED');
  });

  it('no baseline → UNKNOWN', () => {
    expect(resolveDisplayMode(null, false)).toBe('UNKNOWN');
    expect(resolveDisplayMode('estimated', false)).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MEASUREMENT OVERDUE
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyMeasurementOverdue', () => {
  it('>= 180 days is overdue', () => {
    expect(classifyMeasurementOverdue(200)).toBe(true);
    expect(classifyMeasurementOverdue(180)).toBe(true);
  });

  it('recent or unknown is not overdue', () => {
    expect(classifyMeasurementOverdue(30)).toBe(false);
    expect(classifyMeasurementOverdue(null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TIRE AGE (DOT)
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyTireAgeYears', () => {
  it('>= 10y → WARNING, >= 6y → WATCH, fresh → GOOD', () => {
    expect(classifyTireAgeYears(11)).toBe('WARNING');
    expect(classifyTireAgeYears(7)).toBe('WATCH');
    expect(classifyTireAgeYears(2)).toBe('GOOD');
  });

  it('missing → UNKNOWN', () => {
    expect(classifyTireAgeYears(null)).toBe('UNKNOWN');
    expect(classifyTireAgeYears(undefined)).toBe('UNKNOWN');
  });
});

describe('dotAgeYears', () => {
  const now = new Date(2025, 5, 1); // 2025-06-01

  it('parses WWYY into a plausible age', () => {
    const age = dotAgeYears('1219', now); // week 12 / 2019
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThan(5.5);
    expect(age!).toBeLessThan(6.5);
  });

  it('returns null for unparseable / future / invalid codes', () => {
    expect(dotAgeYears(null, now)).toBeNull();
    expect(dotAgeYears('12', now)).toBeNull();
    expect(dotAgeYears('9919', now)).toBeNull(); // week 99 invalid
    expect(dotAgeYears('1299', now)).toBeNull(); // year 2099 → negative age
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AGGREGATION (CRITICAL wins, UNKNOWN ignored)
// ═══════════════════════════════════════════════════════════════════════════════

describe('aggregateTireStatus', () => {
  it('CRITICAL always wins', () => {
    expect(aggregateTireStatus('GOOD', 'WATCH', 'CRITICAL', 'WARNING')).toBe('CRITICAL');
  });

  it('WARNING beats WATCH beats GOOD', () => {
    expect(aggregateTireStatus('GOOD', 'WATCH', 'WARNING')).toBe('WARNING');
    expect(aggregateTireStatus('GOOD', 'WATCH')).toBe('WATCH');
    expect(aggregateTireStatus('GOOD', 'GOOD')).toBe('GOOD');
  });

  it('UNKNOWN signals are ignored', () => {
    expect(aggregateTireStatus('UNKNOWN', 'GOOD', null, undefined)).toBe('GOOD');
  });

  it('only UNKNOWN/empty → UNKNOWN', () => {
    expect(aggregateTireStatus('UNKNOWN', null, undefined)).toBe('UNKNOWN');
    expect(aggregateTireStatus()).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ALERTABILITY / BARS / LEGACY / CODE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('isAlertableStatus', () => {
  it('WATCH never alerts, WARNING/CRITICAL do', () => {
    expect(isAlertableStatus('GOOD')).toBe(false);
    expect(isAlertableStatus('WATCH')).toBe(false);
    expect(isAlertableStatus('WARNING')).toBe(true);
    expect(isAlertableStatus('CRITICAL')).toBe(true);
  });
});

describe('statusToBars', () => {
  it('maps to the 3-bar indicator (0 = unknown)', () => {
    expect(statusToBars('GOOD')).toBe(3);
    expect(statusToBars('WATCH')).toBe(2);
    expect(statusToBars('WARNING')).toBe(1);
    expect(statusToBars('CRITICAL')).toBe(1);
    expect(statusToBars('UNKNOWN')).toBe(0);
  });
});

describe('legacyHealthStatusToCanonical', () => {
  it('maps the legacy Prisma enum to the canonical scale', () => {
    expect(legacyHealthStatusToCanonical('EXCELLENT')).toBe('GOOD');
    expect(legacyHealthStatusToCanonical('GOOD')).toBe('GOOD');
    expect(legacyHealthStatusToCanonical('MODERATE')).toBe('WATCH');
    expect(legacyHealthStatusToCanonical('POOR')).toBe('WARNING');
    expect(legacyHealthStatusToCanonical('REPLACE_NOW')).toBe('CRITICAL');
    expect(legacyHealthStatusToCanonical(null)).toBe('UNKNOWN');
  });
});

describe('alertTypeToCode', () => {
  it('maps internal alert types to stable canonical codes', () => {
    expect(alertTypeToCode('CRITICAL_TREAD')).toBe('TIRE_TREAD_CRITICAL');
    expect(alertTypeToCode('LOW_TREAD')).toBe('TIRE_TREAD_LOW');
    expect(alertTypeToCode('SEASON_MISMATCH')).toBe('TIRE_SEASON_MISMATCH');
    expect(alertTypeToCode('MEASUREMENT_OVERDUE')).toBe('TIRE_MEASUREMENT_OVERDUE');
    expect(alertTypeToCode('TIRE_AGE_WARNING')).toBe('TIRE_AGE_WARNING');
    expect(alertTypeToCode('AXLE_WEAR_IMBALANCE')).toBe('TIRE_WEAR_UNEVEN');
    expect(alertTypeToCode('ROTATION_OVERDUE')).toBe('TIRE_ROTATION_RECOMMENDED');
    expect(alertTypeToCode('SOMETHING_NEW')).toBe('TIRE_GENERIC');
  });
});

describe('confidenceLevelToLabel / confidenceLevelToScore', () => {
  it('keeps label and score aligned with canonical enum', () => {
    expect(confidenceLevelToLabel('HIGH')).toBe('High');
    expect(confidenceLevelToScore('HIGH')).toBe(85);
    expect(confidenceLevelToLabel('MEDIUM')).toBe('Medium');
    expect(confidenceLevelToScore('MEDIUM')).toBe(65);
    expect(confidenceLevelToLabel('LOW')).toBe('Low');
    expect(confidenceLevelToScore('UNKNOWN')).toBe(20);
  });
});
