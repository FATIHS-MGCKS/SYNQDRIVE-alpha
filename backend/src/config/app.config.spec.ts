import { resolveSwaggerEnabled } from './app.config';

describe('resolveSwaggerEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SWAGGER_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('disables swagger in production when unset', () => {
    expect(resolveSwaggerEnabled('production')).toBe(false);
  });

  it('enables swagger in development when unset', () => {
    expect(resolveSwaggerEnabled('development')).toBe(true);
  });

  it('honors SWAGGER_ENABLED=true in production', () => {
    process.env.SWAGGER_ENABLED = 'true';
    expect(resolveSwaggerEnabled('production')).toBe(true);
  });

  it('honors SWAGGER_ENABLED=false in development', () => {
    process.env.SWAGGER_ENABLED = 'false';
    expect(resolveSwaggerEnabled('development')).toBe(false);
  });
});
