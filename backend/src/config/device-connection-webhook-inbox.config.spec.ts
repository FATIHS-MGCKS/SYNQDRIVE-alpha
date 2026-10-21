import {
  CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO,
  resolveLifecycleReconcileConfig,
} from '@config/device-connection-webhook-inbox.config';

describe('device-connection-webhook-inbox.config — lifecycle cutover', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('N11: production without cutover disables automatic reconciliation', () => {
    delete process.env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER;
    process.env.NODE_ENV = 'production';

    const config = resolveLifecycleReconcileConfig(process.env);
    expect(config.automaticLifecycleReconciliationEnabled).toBe(false);
    expect(config.lifecycleReconcileAfter).toBeNull();
  });

  it('N12: production with explicit cutover enables reconciliation', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER = '2026-08-26T14:30:00.000Z';

    const config = resolveLifecycleReconcileConfig(process.env);
    expect(config.automaticLifecycleReconciliationEnabled).toBe(true);
    expect(config.lifecycleReconcileAfter?.toISOString()).toBe('2026-08-26T14:30:00.000Z');
  });

  it('N13: invalid cutover string fails configuration validation', () => {
    process.env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER = 'not-a-date';

    expect(() => resolveLifecycleReconcileConfig(process.env)).toThrow(
      /Invalid CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER/,
    );
  });

  it('non-production without env uses deterministic dev default', () => {
    delete process.env.CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER;
    process.env.NODE_ENV = 'test';

    const config = resolveLifecycleReconcileConfig(process.env);
    expect(config.automaticLifecycleReconciliationEnabled).toBe(true);
    expect(config.lifecycleReconcileAfter?.toISOString()).toBe(
      CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO,
    );
  });
});
