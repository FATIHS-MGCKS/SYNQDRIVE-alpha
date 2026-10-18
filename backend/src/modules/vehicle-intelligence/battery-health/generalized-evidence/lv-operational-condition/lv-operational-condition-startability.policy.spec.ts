import { evaluateStartabilityV1, hasValidatedStartabilityCrankEvidenceV1 } from './lv-operational-condition-startability.policy';

describe('lv-operational-condition-startability P1.1', () => {
  it('validates crank evidence from battery_features with plausible dip', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: 'trip-1',
      crankAtIso: '2026-10-01T08:00:00.000Z',
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: 1.2,
      vRecovery5sV: 12.1,
      vRecovery30sV: 12.3,
      crankObservationCount: 3,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(true);
    const result = evaluateStartabilityV1({ observations: [], crankEvidence: crank });
    expect(result.status).toBe('GREEN');
    expect(result.reasonCodes).toContain('STARTABILITY_CRANK_EVIDENCE_VALIDATED');
  });

  it('rejects crank evidence without observation count or crank timestamp', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: null,
      crankAtIso: null,
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: null,
      vRecovery5sV: null,
      vRecovery30sV: null,
      crankObservationCount: 0,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(false);
  });

  it('rejects crank voltages without trip anchor (same-event provenance)', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: null,
      crankAtIso: '2026-10-01T08:00:00.000Z',
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: 1.2,
      vRecovery5sV: null,
      vRecovery30sV: null,
      crankObservationCount: 2,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(false);
  });

  it('rejects observation count without aligned crank timestamp', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: 'trip-1',
      crankAtIso: null,
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: 1.2,
      vRecovery5sV: null,
      vRecovery30sV: null,
      crankObservationCount: 3,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(false);
  });

  it('rejects stored crankDropV inconsistent with pre/min voltages', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: 'trip-1',
      crankAtIso: '2026-10-01T08:00:00.000Z',
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: 0.2,
      vRecovery5sV: null,
      vRecovery30sV: null,
      crankObservationCount: 1,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(false);
  });

  it('accepts null crankDropV when voltages imply a plausible dip', () => {
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: 'trip-1',
      crankAtIso: '2026-10-01T08:00:00.000Z',
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: null,
      vRecovery5sV: null,
      vRecovery30sV: null,
      crankObservationCount: 1,
    };
    expect(hasValidatedStartabilityCrankEvidenceV1(crank)).toBe(true);
  });
});
