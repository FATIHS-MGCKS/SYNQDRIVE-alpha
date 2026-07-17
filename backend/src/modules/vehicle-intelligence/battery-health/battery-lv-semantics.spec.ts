import {
  ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
  ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
  LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
  mapLvEvidenceValueType,
} from './battery-lv-semantics';

describe('battery-lv-semantics', () => {
  it('maps LV SOH_PERCENT evidence to estimated health score semantics', () => {
    const mapped = mapLvEvidenceValueType('SOH_PERCENT', 'LV');
    expect(mapped.semanticValueType).toBe(LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC);
    expect(mapped.displayLabel).toBe(ESTIMATED_LV_HEALTH_SCORE_LABEL_DE);
  });

  it('keeps HV SOH_PERCENT as SOH', () => {
    const mapped = mapLvEvidenceValueType('SOH_PERCENT', 'HV');
    expect(mapped.semanticValueType).toBeNull();
    expect(mapped.displayLabel).toBe('SOH');
  });

  it('exports canonical semantic constant', () => {
    expect(ESTIMATED_LV_HEALTH_SCORE_SEMANTIC).toBe('ESTIMATED_LV_HEALTH_SCORE');
  });
});
