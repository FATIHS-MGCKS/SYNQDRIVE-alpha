describe('billingEmailConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('defaults billing email to disabled outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.BILLING_EMAIL_ENABLED;

    const billingEmailConfig = (await import('./billing-email.config')).default;
    expect(billingEmailConfig().enabled).toBe(false);
  });

  it('enables billing email in production unless explicitly disabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BILLING_EMAIL_ENABLED;

    const billingEmailConfig = (await import('./billing-email.config')).default;
    expect(billingEmailConfig().enabled).toBe(true);
  });

  it('allows explicit enable in non-production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.BILLING_EMAIL_ENABLED = 'true';

    const billingEmailConfig = (await import('./billing-email.config')).default;
    expect(billingEmailConfig().enabled).toBe(true);
  });
});
