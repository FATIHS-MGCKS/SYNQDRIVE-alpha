import {
  ONEAUTO_SERVICE_CATALOG,
  resolveCatalogEntryForRuntime,
} from './catalog/oneauto-service-catalog';
import { buildOneAutoContractGateReport } from './catalog/oneauto-verified-contracts';
import { assertOneAutoAllowlistedPath } from './client/oneauto-allowlist';
import { isValidVin, normalizeVin } from './client/oneauto-vin.util';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';
import { ConfigService } from '@nestjs/config';

describe('OneAuto catalog', () => {
  it('lists six initial SKUs', () => {
    expect(ONEAUTO_SERVICE_CATALOG).toHaveLength(6);
  });

  it('marks runtime entries CONTRACT_UNVERIFIED when registry empty', () => {
    const entry = ONEAUTO_SERVICE_CATALOG[0];
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { [entry.serviceSku]: 100 },
      pricingCatalogVersion: 'v1',
    });
    expect(resolved.availabilityStatus).toBe('CONTRACT_UNVERIFIED');
    expect(buildOneAutoContractGateReport(entry.serviceSku).executable).toBe(false);
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
  });

  it('accepts normalized valid VIN', () => {
    const v = normalizeVin(' wba12345678901234 ');
    expect(v).toBe('WBA12345678901234');
    expect(isValidVin(v)).toBe(true);
  });
});

describe('OneAuto allowlist', () => {
  it('rejects all paths when verified registry is empty', () => {
    expect(() => assertOneAutoAllowlistedPath('GET', ONEAUTO_SERVICE_CATALOG[0].providerPathTemplate)).toThrow(
      /CONTRACT_UNVERIFIED|NOT_ALLOWLISTED/,
    );
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

  it('rejects outbound HTTP when verified registry is empty', async () => {
    process.env.ONEAUTO_API_KEY = 'test-key-redacted';
    const client = new OneAutoHttpClient(config);
    await expect(
      client.getVinLookup({
        relativePath: 'oe/vinlookupeu/v1/lookup',
        vin: 'WBA12345678901234',
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_UNVERIFIED' });
  });
});

describe('OneAuto redaction', () => {
  it('redacts sensitive keys in provider JSON', () => {
    const out = redactProviderResponseBody({
      vin: 'WBA12345678901234',
      apiKey: 'secret',
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe('[REDACTED]');
  });
});
