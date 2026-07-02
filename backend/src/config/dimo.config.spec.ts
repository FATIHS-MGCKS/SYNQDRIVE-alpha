describe('dimo.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults telemetry API URL when unset', async () => {
    delete process.env.DIMO_TELEMETRY_API_URL;
    process.env.DIMO_ENV = 'production';

    const dimoConfig = (await import('./dimo.config')).default;
    const config = dimoConfig();

    expect(config.telemetryApiUrl).toBe('https://telemetry-api.dimo.zone/query');
    expect(config.dimoEnv).toBe('production');
  });

  it('does not expose DIMO Agents LLM configuration fields', async () => {
    const dimoConfig = (await import('./dimo.config')).default;
    const config = dimoConfig() as Record<string, unknown>;

    expect(config.agentsBaseUrl).toBeUndefined();
    expect(config.agentUserWallet).toBeUndefined();
    expect(config.dimoApiKey).toBeUndefined();
  });
});
