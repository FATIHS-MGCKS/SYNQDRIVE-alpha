import {
  aggregateBrakeCondition,
  alertCodeSeverity,
  alertTypeToCode,
  buildRemainingKmRange,
  classifyConfidenceLevel,
  classifyDtcSeverity,
  classifyEstimatedCondition,
  classifyFluidStatus,
  classifyMeasuredThickness,
  conditionToBars,
  conditionToLegacyStatus,
  dataBasisFromAnchorValidation,
  dtcConditionToAlertSeverity,
  evidenceSourceToDataBasis,
  harshBrakeWearMultiplier,
  isAlertableCondition,
  strongerDataBasis,
} from './brake-status';

// ═══════════════════════════════════════════════════════════════════════════════
//  HARSH BRAKING → WEAR MULTIPLIER (spec §4)
//  Harsh braking only scales the wear multiplier — never a condition by itself.
// ═══════════════════════════════════════════════════════════════════════════════

describe('harshBrakeWearMultiplier', () => {
  it('normal band (0–1 / 100km) → 1.00x', () => {
    expect(harshBrakeWearMultiplier(0).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(0.5).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(1).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(1).level).toBe('normal');
  });

  it('elevated band (1–3) → 1.15x', () => {
    expect(harshBrakeWearMultiplier(2).multiplier).toBe(1.15);
    expect(harshBrakeWearMultiplier(3).multiplier).toBe(1.15);
    expect(harshBrakeWearMultiplier(2).level).toBe('elevated');
  });

  it('high band (3–6) → 1.35x', () => {
    expect(harshBrakeWearMultiplier(4).multiplier).toBe(1.35);
    expect(harshBrakeWearMultiplier(6).multiplier).toBe(1.35);
    expect(harshBrakeWearMultiplier(5).level).toBe('high');
  });

  it('very high band (6+) → 1.60x', () => {
    expect(harshBrakeWearMultiplier(8).multiplier).toBe(1.6);
    expect(harshBrakeWearMultiplier(20).multiplier).toBe(1.6);
    expect(harshBrakeWearMultiplier(8).level).toBe('very_high');
  });

  it('a rising harsh-brake multiplier is monotonic', () => {
    const m0 = harshBrakeWearMultiplier(0).multiplier;
    const m2 = harshBrakeWearMultiplier(2).multiplier;
    const m5 = harshBrakeWearMultiplier(5).multiplier;
    const m9 = harshBrakeWearMultiplier(9).multiplier;
    expect(m2).toBeGreaterThan(m0);
    expect(m5).toBeGreaterThan(m2);
    expect(m9).toBeGreaterThan(m5);
  });

  it('null / NaN / negative defaults to normal 1.00x', () => {
    expect(harshBrakeWearMultiplier(null).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(undefined).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(NaN).multiplier).toBe(1.0);
    expect(harshBrakeWearMultiplier(-5).multiplier).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ESTIMATED CONDITION NEVER CRITICAL (spec §5)
//  Many harsh brakings + high usage may at most produce WARNING.
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyEstimatedCondition', () => {
  it('healthy estimate → GOOD', () => {
    expect(classifyEstimatedCondition(80, 12000)).toBe('GOOD');
  });

  it('mid estimate → WATCH', () => {
    expect(classifyEstimatedCondition(40, 5000)).toBe('WATCH');
  });

  it('worn estimate → WARNING', () => {
    expect(classifyEstimatedCondition(20, 1800)).toBe('WARNING');
  });

  it('a fully-worn ESTIMATE never escalates to CRITICAL (caps at WARNING)', () => {
    expect(classifyEstimatedCondition(0, 0)).toBe('WARNING');
    expect(classifyEstimatedCondition(2, 100)).toBe('WARNING');
  });

  it('returns UNKNOWN when neither signal is available', () => {
    expect(classifyEstimatedCondition(null, null)).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MEASURED THICKNESS CAN BE CRITICAL (spec §5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyMeasuredThickness', () => {
  const CRIT = 3;
  const WARN = 4;

  it('at/below critical mm → CRITICAL', () => {
    expect(classifyMeasuredThickness(2.0, CRIT, WARN)).toBe('CRITICAL');
    expect(classifyMeasuredThickness(3.0, CRIT, WARN)).toBe('CRITICAL');
  });

  it('between critical and warning → WARNING', () => {
    expect(classifyMeasuredThickness(3.5, CRIT, WARN)).toBe('WARNING');
    expect(classifyMeasuredThickness(4.0, CRIT, WARN)).toBe('WARNING');
  });

  it('just above warning → WATCH', () => {
    expect(classifyMeasuredThickness(4.5, CRIT, WARN)).toBe('WATCH');
  });

  it('well above warning → GOOD', () => {
    expect(classifyMeasuredThickness(9, CRIT, WARN)).toBe('GOOD');
  });

  it('missing measurement → UNKNOWN (no fake mm)', () => {
    expect(classifyMeasuredThickness(null, CRIT, WARN)).toBe('UNKNOWN');
    expect(classifyMeasuredThickness(undefined, CRIT, WARN)).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SAFETY SIGNALS (spec §5 — CRITICAL only from real signals)
// ═══════════════════════════════════════════════════════════════════════════════

describe('safety-signal classifiers', () => {
  it('critical brake fluid → CRITICAL', () => {
    expect(classifyFluidStatus('CRITICAL')).toBe('CRITICAL');
    expect(classifyFluidStatus('warning')).toBe('WARNING');
    expect(classifyFluidStatus('good')).toBe('GOOD');
    expect(classifyFluidStatus('???')).toBe('UNKNOWN');
  });

  it('safety-relevant brake DTC → CRITICAL', () => {
    expect(classifyDtcSeverity('CRITICAL')).toBe('CRITICAL');
    expect(classifyDtcSeverity('warning')).toBe('WARNING');
    expect(classifyDtcSeverity('info')).toBe('WATCH');
    expect(classifyDtcSeverity(null)).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('aggregateBrakeCondition', () => {
  it('CRITICAL always wins', () => {
    expect(aggregateBrakeCondition('GOOD', 'CRITICAL', 'WATCH')).toBe('CRITICAL');
  });

  it('WARNING beats WATCH, WATCH beats GOOD', () => {
    expect(aggregateBrakeCondition('GOOD', 'WARNING', 'WATCH')).toBe('WARNING');
    expect(aggregateBrakeCondition('GOOD', 'WATCH')).toBe('WATCH');
  });

  it('UNKNOWN signals are ignored', () => {
    expect(aggregateBrakeCondition('UNKNOWN', 'GOOD', 'UNKNOWN')).toBe('GOOD');
  });

  it('all UNKNOWN / empty → UNKNOWN', () => {
    expect(aggregateBrakeCondition('UNKNOWN', null, undefined)).toBe('UNKNOWN');
    expect(aggregateBrakeCondition()).toBe('UNKNOWN');
  });
});

describe('isAlertableCondition', () => {
  it('WATCH never alerts; WARNING/CRITICAL do', () => {
    expect(isAlertableCondition('GOOD')).toBe(false);
    expect(isAlertableCondition('WATCH')).toBe(false);
    expect(isAlertableCondition('WARNING')).toBe(true);
    expect(isAlertableCondition('CRITICAL')).toBe(true);
    expect(isAlertableCondition('UNKNOWN')).toBe(false);
  });
});

describe('conditionToBars', () => {
  it('maps condition → 3-bar indicator', () => {
    expect(conditionToBars('GOOD')).toBe(3);
    expect(conditionToBars('WATCH')).toBe(2);
    expect(conditionToBars('WARNING')).toBe(1);
    expect(conditionToBars('CRITICAL')).toBe(1);
    expect(conditionToBars('UNKNOWN')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DATA BASIS + CONFIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('evidenceSourceToDataBasis', () => {
  it('manual measurement → MEASURED', () => {
    expect(evidenceSourceToDataBasis('MANUAL_MEASUREMENT')).toBe('MEASURED');
  });
  it('documents → DOCUMENTED', () => {
    expect(evidenceSourceToDataBasis('AI_UPLOAD_CONFIRMED')).toBe('DOCUMENTED');
    expect(evidenceSourceToDataBasis('WORKSHOP_MEASUREMENT')).toBe('DOCUMENTED');
    expect(evidenceSourceToDataBasis('AI_UPLOAD_UNCONFIRMED')).toBe('UNKNOWN');
  });
  it('sensor / dtc → SENSOR', () => {
    expect(evidenceSourceToDataBasis('BRAKE_WEAR_SENSOR')).toBe('SENSOR');
    expect(evidenceSourceToDataBasis('DTC_SIGNAL')).toBe('SENSOR');
  });
  it('telematics → ESTIMATED', () => {
    expect(evidenceSourceToDataBasis('TELEMATICS_ESTIMATION')).toBe('ESTIMATED');
  });
});

describe('dataBasisFromAnchorValidation', () => {
  it('maps measured_anchor to MEASURED', () => {
    expect(dataBasisFromAnchorValidation('measured_anchor', 'ESTIMATED')).toBe('MEASURED');
  });

  it('maps spec_fallback_anchor to DOCUMENTED (registration/manual nominal baseline)', () => {
    expect(dataBasisFromAnchorValidation('spec_fallback_anchor', 'ESTIMATED')).toBe('DOCUMENTED');
  });

  it('falls back to state class when anchor status is absent', () => {
    expect(dataBasisFromAnchorValidation(null, 'WARNING_ONLY')).toBe('SENSOR');
    expect(dataBasisFromAnchorValidation(undefined, 'NO_BASELINE')).toBe('UNKNOWN');
  });
});

describe('strongerDataBasis', () => {
  it('MEASURED beats everything', () => {
    expect(strongerDataBasis('MEASURED', 'DOCUMENTED')).toBe('MEASURED');
    expect(strongerDataBasis('ESTIMATED', 'MEASURED')).toBe('MEASURED');
  });
  it('DOCUMENTED beats SENSOR/ESTIMATED', () => {
    expect(strongerDataBasis('DOCUMENTED', 'SENSOR')).toBe('DOCUMENTED');
    expect(strongerDataBasis('ESTIMATED', 'DOCUMENTED')).toBe('DOCUMENTED');
  });
  it('UNKNOWN is weakest', () => {
    expect(strongerDataBasis('UNKNOWN', 'ESTIMATED')).toBe('ESTIMATED');
  });
});

describe('classifyConfidenceLevel', () => {
  it('UNKNOWN data basis → UNKNOWN regardless of score', () => {
    expect(classifyConfidenceLevel({ score: 99, dataBasis: 'UNKNOWN' })).toBe('UNKNOWN');
  });

  it('an ESTIMATE is never HIGH (capped at MEDIUM)', () => {
    expect(classifyConfidenceLevel({ score: 95, dataBasis: 'ESTIMATED' })).toBe('MEDIUM');
    expect(classifyConfidenceLevel({ score: 95, dataBasis: 'SENSOR' })).toBe('MEDIUM');
  });

  it('a fresh high-score measurement → HIGH', () => {
    expect(
      classifyConfidenceLevel({ score: 90, dataBasis: 'MEASURED', measurementAgeDays: 30, kmSinceMeasurement: 2000 }),
    ).toBe('HIGH');
  });

  it('a stale (old / many-km) measurement downgrades HIGH → MEDIUM', () => {
    expect(
      classifyConfidenceLevel({ score: 90, dataBasis: 'MEASURED', measurementAgeDays: 400 }),
    ).toBe('MEDIUM');
    expect(
      classifyConfidenceLevel({ score: 90, dataBasis: 'MEASURED', kmSinceMeasurement: 20000 }),
    ).toBe('MEDIUM');
  });

  it('low score → LOW', () => {
    expect(classifyConfidenceLevel({ score: 30, dataBasis: 'MEASURED' })).toBe('LOW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REMAINING-LIFE RANGE (spec §6 — always a range, never false precision)
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildRemainingKmRange', () => {
  it('returns null when no remaining-km can be derived', () => {
    expect(buildRemainingKmRange(null, 'HIGH')).toBeNull();
    expect(buildRemainingKmRange(undefined, 'HIGH')).toBeNull();
    expect(buildRemainingKmRange(-100, 'HIGH')).toBeNull();
  });

  it('produces a rounded [min,max] band around the estimate', () => {
    const r = buildRemainingKmRange(10000, 'HIGH');
    expect(r).not.toBeNull();
    expect(r!.min).toBe(8500); // 10000 * 0.85, rounded to 500
    expect(r!.max).toBe(11500); // 10000 * 1.15, rounded to 500
    expect(r!.min).toBeLessThan(r!.max);
  });

  it('lower confidence → wider band', () => {
    const high = buildRemainingKmRange(10000, 'HIGH')!;
    const low = buildRemainingKmRange(10000, 'LOW')!;
    const highWidth = high.max - high.min;
    const lowWidth = low.max - low.min;
    expect(lowWidth).toBeGreaterThan(highWidth);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ALERT CODE MAPPING (spec §7)
// ═══════════════════════════════════════════════════════════════════════════════

describe('alert code mapping', () => {
  it('maps internal types to canonical codes', () => {
    expect(alertTypeToCode('PAD_CRITICAL')).toBe('BRAKE_PAD_CRITICAL');
    expect(alertTypeToCode('PAD_WARNING')).toBe('BRAKE_PAD_WARNING');
    expect(alertTypeToCode('BRAKE_SYSTEM_DTC')).toBe('BRAKE_SYSTEM_DTC');
    expect(alertTypeToCode('LOW_CONFIDENCE')).toBe('BRAKE_HEALTH_LOW_CONFIDENCE');
    expect(alertTypeToCode('something_else')).toBe('BRAKE_GENERIC');
  });

  it('critical pad codes are critical; DTC default is warning; fluid/inspection are warnings; low-confidence is info', () => {
    expect(alertCodeSeverity('BRAKE_PAD_CRITICAL')).toBe('critical');
    expect(alertCodeSeverity('BRAKE_SYSTEM_DTC')).toBe('warning');
    expect(alertCodeSeverity('BRAKE_FLUID_WARNING')).toBe('warning');
    expect(alertCodeSeverity('BRAKE_INSPECTION_OVERDUE')).toBe('warning');
    expect(alertCodeSeverity('BRAKE_HEALTH_LOW_CONFIDENCE')).toBe('info');
  });

  it('maps DTC condition bands to alert severity', () => {
    expect(dtcConditionToAlertSeverity('CRITICAL')).toBe('critical');
    expect(dtcConditionToAlertSeverity('WARNING')).toBe('warning');
    expect(dtcConditionToAlertSeverity('WATCH')).toBe('info');
  });

  it('maps canonical condition to legacy status from state class', () => {
    expect(conditionToLegacyStatus('GOOD', 'ESTIMATED')).toBe('healthy');
    expect(conditionToLegacyStatus('WARNING', 'ESTIMATED')).toBe('attention');
    expect(conditionToLegacyStatus('UNKNOWN', 'NO_BASELINE')).toBe('awaiting_baseline');
  });
});
