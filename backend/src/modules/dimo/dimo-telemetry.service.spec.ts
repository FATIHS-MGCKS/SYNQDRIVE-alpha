import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoProviderGateway } from './provider/dimo-provider-gateway.service';
import { DimoProviderOperation } from './provider/dimo-provider-gateway.types';
import { DimoProviderLimiterService } from './provider/dimo-provider-limiter.service';
import { DimoProviderAdmissionService } from './provider/dimo-provider-admission.service';
import { DimoProviderRequestPriority } from './provider/dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createOffGateway(): DimoProviderGateway {
  const config: DimoProviderLimiterConfigShape = {
    enabled: false,
    mode: 'off',
    rateLimitPerSecond: 20,
    rateBurst: 5,
    rateAlgorithm: 'token_bucket',
    maxInFlight: 40,
    inFlightLeaseMs: 45_000,
    reservedHighPrioritySlots: 12,
    maxWaitMs: 5_000,
    maxWaitMsByPriority: {
      [DimoProviderRequestPriority.P0_CRITICAL]: 10_000,
      [DimoProviderRequestPriority.P1_LIVE]: 10_000,
      [DimoProviderRequestPriority.P2_INTERACTIVE]: 5_000,
      [DimoProviderRequestPriority.P3_NORMAL]: 3_750,
      [DimoProviderRequestPriority.P4_BACKGROUND]: 2_500,
    },
    admissionPollMinMs: 25,
    admissionPollMaxMs: 250,
    retryAfterMaxSeconds: 120,
    canaryEnforceOrgIds: new Set<string>(),
    documentedCoreRatePerSecond: 25,
  };
  const limiter = {
    begin: jest.fn(),
    end: jest.fn(),
    setProviderCooldown: jest.fn(),
  } as unknown as DimoProviderLimiterService;
  const admission = {
    acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
  } as unknown as DimoProviderAdmissionService;
  return new DimoProviderGateway(config, admission, limiter);
}

describe('DimoTelemetryService (P1.3-S1 gateway parity)', () => {
  let service: DimoTelemetryService;
  let gatewayExecuteSpy: jest.SpyInstance;
  const vehicleJwt = 'vehicle-jwt-token';
  const postMock = jest.fn();

  beforeEach(() => {
    postMock.mockReset();
    mockedAxios.create.mockReturnValue({ post: postMock } as any);

    const gateway = createOffGateway();
    gatewayExecuteSpy = jest.spyOn(gateway, 'execute');

    service = new DimoTelemetryService(
      {
        get: jest.fn((key: string) => {
          if (key === 'dimo.telemetryApiUrl') {
            return 'https://telemetry-api.dimo.zone/query';
          }
          if (key === 'dimo.requestTimeoutMs') {
            return 10000;
          }
          return undefined;
        }),
      } as unknown as ConfigService,
      gateway,
    );
  });

  afterEach(() => {
    gatewayExecuteSpy.mockRestore();
  });

  it('A — successful queryGraphQL result unchanged', async () => {
    postMock.mockResolvedValue({
      data: { data: { signalsLatest: { speed: { value: 12 } } } },
    });

    const result = await service.queryGraphQL(vehicleJwt, 'query { x }');

    expect(result).toEqual({ data: { signalsLatest: { speed: { value: 12 } } } });
    expect(gatewayExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: DimoProviderOperation.TELEMETRY_GRAPHQL }),
    );
  });

  it('B — GraphQL 200 + errors without data throws unchanged', async () => {
    postMock.mockResolvedValue({
      data: { errors: [{ message: 'field forbidden' }] },
    });

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toThrow(
      'DIMO GraphQL error: field forbidden',
    );
  });

  it('B2 — GraphQL 200 + errors with partial data returns data unchanged', async () => {
    postMock.mockResolvedValue({
      data: {
        data: { signalsLatest: {} },
        errors: [{ message: 'partial' }],
      },
    });

    const result = await service.queryGraphQL(vehicleJwt, 'query { x }');
    expect(result.data.signalsLatest).toEqual({});
  });

  it('C — HTTP 401 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { message: 'unauthorized' } },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('D — HTTP 403 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403 },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('E — HTTP 429 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, headers: { 'retry-after': '2' } },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('F — HTTP 5xx propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 503'), {
      response: { status: 503 },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('G — queryGraphQL uses 15s timeout override', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query { x }', { tokenId: 1 });

    expect(postMock).toHaveBeenCalledWith(
      '',
      { query: 'query { x }', variables: { tokenId: 1 } },
      expect.objectContaining({
        headers: { Authorization: `Bearer ${vehicleJwt}` },
        timeout: 15000,
      }),
    );
  });

  it('H — gateway is pass-through (invoke executes real HTTP)', async () => {
    postMock.mockResolvedValue({ data: { data: { ok: true } } });

    await service.queryGraphQL(vehicleJwt, 'query { ok }');

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(gatewayExecuteSpy).toHaveBeenCalledTimes(1);
  });

  it('I — GraphQL body and variables unchanged', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query Q($id: Int!) { x }', { id: 9 });

    expect(postMock).toHaveBeenCalledWith(
      '',
      { query: 'query Q($id: Int!) { x }', variables: { id: 9 } },
      expect.any(Object),
    );
  });

  it('J — Authorization header unchanged', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query { x }');

    expect(postMock.mock.calls[0][2].headers.Authorization).toBe(
      `Bearer ${vehicleJwt}`,
    );
  });

  it('fetchVehicleSummary preserves default client timeout (no 15s override)', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          signalsLatest: {
            lastSeen: '2026-01-01T00:00:00Z',
            speed: { value: 40 },
          },
        },
      },
    });

    const summary = await service.fetchVehicleSummary(vehicleJwt, 123);

    expect(summary.speedKmh).toBe(40);
    expect(postMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ query: expect.stringContaining('signalsLatest') }),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${vehicleJwt}` },
      }),
    );
    expect(postMock.mock.calls[0][2].timeout).toBeUndefined();
    expect(gatewayExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
        requestContext: { tokenId: 123 },
      }),
    );
  });

  it('fetchVehicleVin returns null on HTTP error (unchanged degrade)', async () => {
    postMock.mockRejectedValue(new Error('Request failed with status code 403'));

    const vin = await service.fetchVehicleVin(vehicleJwt, 456);

    expect(vin).toBeNull();
    expect(gatewayExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_VIN,
      }),
    );
  });
});
