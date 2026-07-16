import {
  effectiveCrankDropForDecisions,
  effectiveCrankObservationCountForMaturity,
  effectiveCrankStatusForDecisions,
  LEGACY_CRANK_DISPLAY_MODE,
  presentLegacyCrankFeatures,
} from './battery-crank-policy';
import { BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV } from '../../../config/battery-health-v2.config';

describe('battery-crank-policy', () => {
  const originalEnv = process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];
    } else {
      process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = originalEnv;
    }
  });

  it('marks stored legacy crank as diagnostic LEGACY_UNVERIFIED by default', () => {
    const presented = presentLegacyCrankFeatures({
      crankDrop: 2.4,
      crankObservationCount: 4,
      crankAt: '2026-07-15T08:00:00.000Z',
    });
    expect(presented.displayMode).toBe(LEGACY_CRANK_DISPLAY_MODE);
    expect(presented.decisionCapable).toBe(false);
    expect(presented.diagnosticCrankDrop).toBe(2.4);
    expect(presented.crankDrop).toBeNull();
    expect(presented.operationalStatus).toBe('UNKNOWN');
    expect(presented.claimsSubSecondPrecision).toBe(false);
  });

  it('does not use crank for decisions when legacy assessment is disabled', () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'false';
    expect(effectiveCrankDropForDecisions(2.5)).toBeNull();
    expect(effectiveCrankStatusForDecisions(2.5)).toBe('UNKNOWN');
    expect(effectiveCrankObservationCountForMaturity(5)).toBe(0);
  });

  it('allows crank decisions only when legacy assessment flag is explicitly enabled', () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'true';
    expect(effectiveCrankDropForDecisions(2.5)).toBe(2.5);
    expect(effectiveCrankStatusForDecisions(2.5)).toBe('CRITICAL');
    expect(effectiveCrankObservationCountForMaturity(5)).toBe(5);
    const presented = presentLegacyCrankFeatures({ crankDrop: 1.0 });
    expect(presented.decisionCapable).toBe(true);
    expect(presented.crankDrop).toBe(1.0);
  });
});
