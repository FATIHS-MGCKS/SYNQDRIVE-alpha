import { ProductSlug } from '@prisma/client';
import {
  isEligibleExternalAppProductSlug,
  validateCoreAppM2mScopeDefinitions,
} from './core-app-service-registry.policy';

describe('core-app-service-registry.policy', () => {
  it('allows RENTAL, FLEET, VYMOD and rejects TAXI', () => {
    expect(isEligibleExternalAppProductSlug(ProductSlug.RENTAL)).toBe(true);
    expect(isEligibleExternalAppProductSlug(ProductSlug.FLEET)).toBe(true);
    expect(isEligibleExternalAppProductSlug(ProductSlug.VYMOD)).toBe(true);
    expect(isEligibleExternalAppProductSlug(ProductSlug.TAXI)).toBe(false);
  });

  it('flags unknown scopes', () => {
    expect(validateCoreAppM2mScopeDefinitions(['core:entitlements:read'])).toEqual([]);
    expect(validateCoreAppM2mScopeDefinitions(['core:entitlements:read', 'evil:scope'])).toEqual([
      'evil:scope',
    ]);
  });
});