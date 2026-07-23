import { AuthorizationDecisionStartupService } from './authorization-decision-startup.service';

describe('AuthorizationDecisionStartupService', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws on unsafe production configuration', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DATA_AUTH_DECISION_DEV_BYPASS: 'true',
    };
    const service = new AuthorizationDecisionStartupService();
    expect(() => service.onModuleInit()).toThrow(/unsafe configuration/i);
  });

  it('starts cleanly with valid production configuration', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DATA_AUTH_DECISION_DEV_BYPASS: 'false',
      DATA_AUTH_DECISION_ENFORCEMENT_ENABLED: 'true',
    };
    const service = new AuthorizationDecisionStartupService();
    expect(() => service.onModuleInit()).not.toThrow();
  });
});
