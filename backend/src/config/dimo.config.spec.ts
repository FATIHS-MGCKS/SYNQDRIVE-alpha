describe('dimo.config agentsBaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to production agents.dimo.zone when DIMO_AGENTS_BASE_URL is unset', async () => {
    delete process.env.DIMO_AGENTS_BASE_URL;
    process.env.DIMO_ENV = 'dev';

    const dimoConfig = (await import('./dimo.config')).default;
    const config = dimoConfig();

    expect(config.agentsBaseUrl).toBe('https://agents.dimo.zone');
  });

  it('uses DIMO_AGENTS_BASE_URL when explicitly set', async () => {
    process.env.DIMO_AGENTS_BASE_URL = 'https://custom-agents.example';
    process.env.DIMO_ENV = 'production';

    const dimoConfig = (await import('./dimo.config')).default;
    const config = dimoConfig();

    expect(config.agentsBaseUrl).toBe('https://custom-agents.example');
  });
});
