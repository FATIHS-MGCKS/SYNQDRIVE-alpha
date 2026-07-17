import {
  buildNoBrakePayloadResult,
  deriveRegistrationBrakeResult,
} from './registration-brake-outcome';

describe('registration-brake-outcome', () => {
  it('buildNoBrakePayloadResult returns NO_BASELINE', () => {
    const result = buildNoBrakePayloadResult();
    expect(result.brakeHealthInitialized).toBe(false);
    expect(result.brakeBaselineStatus).toBe('NO_BASELINE');
    expect(result.requiresMeasurement).toBe(true);
  });

  it('maps documented NEW replacement without user mm to DOCUMENTED_REPLACEMENT', () => {
    const result = deriveRegistrationBrakeResult({
      rawBrakes: { condition: 'NEW' },
      specCreated: true,
      initialized: true,
      anchorValidationStatus: 'spec_fallback_anchor',
    });

    expect(result.brakeHealthInitialized).toBe(true);
    expect(result.brakeBaselineStatus).toBe('DOCUMENTED_REPLACEMENT');
    expect(result.evidenceSource).toBe('DOCUMENTED_REPLACEMENT');
    expect(result.requiresMeasurement).toBe(true);
    expect(result.requiresSpecConfirmation).toBe(false);
  });

  it('maps user-submitted mm to MEASURED', () => {
    const result = deriveRegistrationBrakeResult({
      rawBrakes: { condition: 'NEW', frontPadThickness: 10.5, rearPadThickness: 10.2 },
      specCreated: true,
      initialized: true,
      anchorValidationStatus: 'measured_anchor',
    });

    expect(result.brakeBaselineStatus).toBe('MEASURED');
    expect(result.evidenceSource).toBe('MEASURED');
    expect(result.requiresMeasurement).toBe(false);
  });

  it('maps spec-only without init to SPEC_ONLY', () => {
    const result = deriveRegistrationBrakeResult({
      rawBrakes: { condition: 'UNKNOWN', frontPadThickness: 8.5 },
      specCreated: true,
      initialized: false,
      initBlockedReason: 'not_eligible',
    });

    expect(result.brakeBaselineStatus).toBe('SPEC_ONLY');
    expect(result.evidenceSource).toBe('SPEC_ONLY');
    expect(result.requiresSpecConfirmation).toBe(true);
  });

  it('maps missing odometer to INITIALIZATION_REQUIRED', () => {
    const result = deriveRegistrationBrakeResult({
      rawBrakes: { condition: 'USED', frontPadThickness: 8.5 },
      specCreated: true,
      initialized: false,
      initBlockedReason: 'missing_odometer',
    });

    expect(result.brakeBaselineStatus).toBe('INITIALIZATION_REQUIRED');
    expect(result.brakeHealthInitialized).toBe(false);
  });

  it('maps initialization failure to FAILED with visible error', () => {
    const result = deriveRegistrationBrakeResult({
      rawBrakes: { condition: 'NEW' },
      specCreated: true,
      initialized: false,
      initializationError: 'db unavailable',
    });

    expect(result.brakeBaselineStatus).toBe('FAILED');
    expect(result.initializationError).toBe('db unavailable');
    expect(result.brakeHealthInitialized).toBe(false);
  });
});
