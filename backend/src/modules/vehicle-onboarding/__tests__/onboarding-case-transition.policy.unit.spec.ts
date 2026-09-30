import { assertCaseTransitionAllowed } from '../policy/onboarding-case-transition.policy';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('onboarding case transition policy', () => {
  it('allows OPEN → IN_PROGRESS', () => {
    expect(() => assertCaseTransitionAllowed('OPEN', 'IN_PROGRESS')).not.toThrow();
  });

  it('blocks COMPLETED → OPEN', () => {
    expect(() => assertCaseTransitionAllowed('COMPLETED', 'OPEN')).toThrow(VehicleOnboardingError);
  });
});
