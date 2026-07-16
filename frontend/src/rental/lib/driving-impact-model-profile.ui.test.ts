import { describe, expect, it } from 'vitest';
import {
  formatDrivingImpactModelProfileFootnote,
  getDrivingImpactComparabilityHint,
  getDrivingImpactModelProfileLabel,
} from './driving-impact-model-profile.ui';

describe('driving-impact-model-profile.ui', () => {
  it('returns German profile label and comparability hint', () => {
    const profile = {
      version: 'impact-model-profile-v1',
      profile: 'SMART5_LIMITED' as const,
      comparabilityHint:
        'HF-Rekonstruktion ohne native Ereignisse — nicht mit LTE-R1 oder EV-Profilen vergleichen.',
    };
    expect(getDrivingImpactModelProfileLabel(profile)).toBe('SMART5 (HF-Rekonstruktion)');
    expect(getDrivingImpactComparabilityHint(profile)).toContain('HF-Rekonstruktion');
    expect(formatDrivingImpactModelProfileFootnote(profile)).toContain('impact-model-profile-v1');
  });
});
