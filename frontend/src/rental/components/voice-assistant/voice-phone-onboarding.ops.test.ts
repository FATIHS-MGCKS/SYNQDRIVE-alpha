import { describe, expect, it } from 'vitest';
import { isPhoneOnboardingComplete, phoneOnboardingStatusTone } from './voice-phone-onboarding.ops';

describe('voice-phone-onboarding.ops', () => {
  it('maps statuses to presentation tones', () => {
    expect(phoneOnboardingStatusTone('active')).toBe('success');
    expect(phoneOnboardingStatusTone('failed')).toBe('critical');
    expect(phoneOnboardingStatusTone('not_started')).toBe('neutral');
  });

  it('treats active and reserved as wizard-complete', () => {
    expect(isPhoneOnboardingComplete('active')).toBe(true);
    expect(isPhoneOnboardingComplete('reserved')).toBe(true);
    expect(isPhoneOnboardingComplete('path_selected')).toBe(false);
  });
});
