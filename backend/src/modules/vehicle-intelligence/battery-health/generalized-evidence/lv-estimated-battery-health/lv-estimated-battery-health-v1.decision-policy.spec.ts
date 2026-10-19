import {
  classifyEstimatedHealthStatusP1,
  independentSupportingFamiliesP1,
} from './lv-estimated-battery-health-v1.decision-policy';

describe('lv-estimated-battery-health-v1.decision-policy P1', () => {
  const emptyBands = { GOOD: 0, WATCH: 0, WARNING: 0, CRITICAL: 0, UNSUPPORTED: 0 };

  it('does not RED on multiple CRITICAL rests alone (KS-style undercharge mix)', () => {
    const r = classifyEstimatedHealthStatusP1({
      bandCounts: { ...emptyBands, GOOD: 1, WATCH: 8, CRITICAL: 3 },
      episodeCount: 12,
      trend: 'STABLE',
      loadSignal: 'UNKNOWN',
      chemistryKnown: true,
    });
    expect(r.status).toBe('YELLOW');
    expect(r.ruleId).toBe('RULE_REST_WARNING_OR_DECLINE');
    expect(r.status).not.toBe('RED');
  });

  it('RED when validated load is critical', () => {
    const r = classifyEstimatedHealthStatusP1({
      bandCounts: { ...emptyBands, GOOD: 10, WATCH: 2 },
      episodeCount: 12,
      trend: 'STABLE',
      loadSignal: 'RED',
      chemistryKnown: true,
    });
    expect(r.status).toBe('RED');
    expect(r.ruleId).toBe('RULE_LOAD_CRITICAL_DETERIORATION');
  });

  it('GREEN for healthy majority with sparse WARNING (WOB-style)', () => {
    const r = classifyEstimatedHealthStatusP1({
      bandCounts: { ...emptyBands, GOOD: 19, WATCH: 8, WARNING: 2 },
      episodeCount: 29,
      trend: 'STABLE',
      loadSignal: 'UNKNOWN',
      chemistryKnown: true,
    });
    expect(r.status).toBe('GREEN');
    expect(r.ruleId).toBe('RULE_REST_HEALTHY_MAJORITY');
  });

  it('excludes correlated longitudinal STABLE and charging-from-rest from independent families', () => {
    const r = independentSupportingFamiliesP1({
      hasRestEpisodes: true,
      trend: 'STABLE',
      loadAuthorized: false,
      hasChargingRecoveryEvidence: false,
    });
    expect(r.independent).toEqual(['RESTING_CONDITION']);
    expect(r.correlatedExcluded).toContain('LONGITUDINAL_STABILITY');
    expect(r.correlatedExcluded).toContain('CHARGING_RECOVERY_CONTEXT');
  });

  it('RED on longitudinal decline with weak rest corroboration', () => {
    const r = classifyEstimatedHealthStatusP1({
      bandCounts: { ...emptyBands, WARNING: 2, CRITICAL: 1, WATCH: 3 },
      episodeCount: 6,
      trend: 'DECLINE',
      loadSignal: 'UNKNOWN',
      chemistryKnown: true,
    });
    expect(r.status).toBe('RED');
    expect(r.ruleId).toBe('RULE_LONGITUDINAL_DECLINE_WITH_WEAK_REST');
  });
});
