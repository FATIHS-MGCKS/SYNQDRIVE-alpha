import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import { assertOneAutoAllowlistedPath } from './client/oneauto-allowlist';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';
import { ConfigService } from '@nestjs/config';

describe('OneAuto catalog', () => {
  it('lists six initial SKUs', () => {
    expect(ONEAUTO_SERVICE_CATALOG).toHaveLength(6);
    const skus = ONEAUTO_SERVICE_CATALOG.map((e) => e.serviceSku);
    expect(skus).toContain('OE_VIN_LOOKUP_EU');
    expect(skus).toContain('RECALL_CHECK');
  });

  it('blocks runtime availability when price not configured', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: true,
      indicativePriceMinorBySku: {},
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('PRICE_NOT_CONFIGURED');
  });

  it('blocks runtime availability when feature disabled', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: false,
      indicativePriceMinorBySku: { [entry.serviceSku]: 100 },
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('DISABLED_FLAG');
  });
});

describe('OneAuto VIN util', () => {
  it('rejects invalid VIN', () => {
    expect(isValidVin('')).toBe(false);
    expect(isValidVin('123')).toBe(false);
    expect(isValidVin('IOOOOOOOOOOOOOOO')).toBe(false);
  });

  it('accepts normalized valid VIN', () => {
    const v = normalizeVin(' wba12345678901234 ');
    expect(v).toBe('WBA12345678901234');
    expect(isValidVin(v)).toBe(true);
  });
});

describe('OneAuto allowlist', () => {
  it('rejects non-catalog paths', () => {
    expect(() => assertOneAutoAllowlistedPath('GET', 'evil/path')).toThrow(/NOT_ALLOWLISTED/);
  });

  it('accepts catalog paths', () => {
    expect(() =>
      assertOneAutoAllowlistedPath('GET', ONEAUTO_SERVICE_CATALOG[0].providerPathTemplate),
    ).not.toThrow();
  });
});

describe('OneAutoHttpClient', () => {
  const config = {
    get: () => ({
      enabled: true,
      apiKeyPresent: true,
      sandbox: true,
      baseUrl: 'https://sandbox.oneautoapi.com',
      requestTimeoutMs: 5000,
      maxRetries: 0,
    }),
  } as unknown as ConfigService;

  it('throws when disabled', async () => {
    const disabledConfig = {
      get: () => ({ enabled: false, apiKeyPresent: true }),
    } as unknown as ConfigService;
    const client = new OneAutoHttpClient(disabledConfig);
    await expect(
      client.getVinLookup({ relativePath: 'oe/vinlookupeu/v1/lookup', vin: 'WBA12345678901234' }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_DISABLED' });
  });

  it('throws when API key missing', async () => {
    const prev = process.env.ONEAUTO_API_KEY;
    delete process.env.ONEAUTO_API_KEY;
    const client = new OneAutoHttpClient(config);
    await expect(
      client.getVinLookup({ relativePath: 'oe/vinlookupeu/v1/lookup', vin: 'WBA12345678901234' }),
    ).rejects.toMatchObject({ code: 'ONEAUTO_API_KEY_MISSING' });
    if (prev) process.env.ONEAUTO_API_KEY = prev;
  });

  it('uses mocked fetch without live network', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ ok: true }),
    });
    const client = new OneAutoHttpClient(config, { fetchImpl: fetchImpl as typeof fetch });
    const result = await client.getVinLookup({
      relativePath: 'oe/vinlookupeu/v1/lookup',
      vin: 'WBA12345678901234',
    });
    expect(result.httpStatus).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain('sandbox.oneautoapi.com');
    expect(calledUrl).toContain('vin=WBA12345678901234');
  });
});

describe('OneAuto redaction', () => {
  it('redacts sensitive keys in provider JSON', () => {
    const out = redactProviderResponseBody({
      vin: 'WBA12345678901234',
      apiKey: 'secret',
      nested: { email: 'a@b.c' },
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).email).toBe('[REDACTED]');
    expect(out.vin).toBe('WBA12345678901234');
  });
});
