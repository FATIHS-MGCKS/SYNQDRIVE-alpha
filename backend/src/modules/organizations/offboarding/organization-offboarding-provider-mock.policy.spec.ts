import {
  isOrganizationOffboardingProviderMockAllowed,
  readProviderMockOutcome,
} from './organization-offboarding-provider-mock.policy';

describe('organization-offboarding-provider-mock.policy', () => {
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNode;
    delete process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL;
    delete process.env.ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED;
  });

  it('ignores mock env in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    expect(isOrganizationOffboardingProviderMockAllowed()).toBe(false);
    expect(readProviderMockOutcome('DIMO')).toBeNull();
  });

  it('allows mock in test NODE_ENV', () => {
    process.env.NODE_ENV = 'test';
    process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL = 'CONFIRMED';
    expect(readProviderMockOutcome('DIMO')).toBe('CONFIRMED');
  });
});