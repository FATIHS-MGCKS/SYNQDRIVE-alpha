import {
  assertSmokeProvisioningGate,
  isSmokeProvisioningEnabled,
  MasterAdminSmokeLifecyclePolicyError,
  resolveSmokeTtlHours,
} from './master-admin-smoke-lifecycle.policy';

describe('master-admin-smoke-lifecycle.policy', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled by default', () => {
    delete process.env.MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED;
    expect(isSmokeProvisioningEnabled()).toBe(false);
  });

  it('requires explicit provisioning gate', () => {
    delete process.env.MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED;
    expect(() =>
      assertSmokeProvisioningGate({ confirmProductionSmoke: true, nodeEnv: 'development' }),
    ).toThrow(MasterAdminSmokeLifecyclePolicyError);
  });

  it('requires production confirmation when NODE_ENV=production', () => {
    process.env.MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED = 'true';
    expect(() =>
      assertSmokeProvisioningGate({ confirmProductionSmoke: false, nodeEnv: 'production' }),
    ).toThrow('--confirm-production-smoke is required when NODE_ENV=production');
  });

  it('allows production when gate and confirmation are set', () => {
    process.env.MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED = 'true';
    expect(() =>
      assertSmokeProvisioningGate({ confirmProductionSmoke: true, nodeEnv: 'production' }),
    ).not.toThrow();
  });

  it('defaults TTL to 4 hours', () => {
    delete process.env.MASTER_ADMIN_SMOKE_TTL_HOURS;
    expect(resolveSmokeTtlHours()).toBe(4);
  });
});
