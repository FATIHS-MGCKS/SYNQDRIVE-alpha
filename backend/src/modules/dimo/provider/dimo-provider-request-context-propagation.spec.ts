import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DimoTelemetryService } from '../dimo-telemetry.service';
import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoRequestExecutor } from '../provider-budget/dimo-request-executor.service';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function percentCanaryConfig() {
  return resolveDimoProviderLimiterConfig({
    DIMO_PROVIDER_LIMITER_MODE: 'shadow',
    DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
    DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '100',
  } as NodeJS.ProcessEnv);
}

function createBypassExecutor(): DimoRequestExecutor {
  return {
    execute: jest.fn(async (params: { execute: () => Promise<unknown> }) =>
      params.execute(),
    ),
  } as unknown as DimoRequestExecutor;
}

function createPropagationHarness() {
  const executeSpy = jest.fn(async (params: { requestContext?: Record<string, unknown> }) => {
    return params;
  });
  const gateway = {
    execute: executeSpy,
  } as unknown as DimoProviderGateway;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'dimo.telemetryApiUrl') return 'https://telemetry-api.dimo.zone/query';
      if (key === 'dimo.requestTimeoutMs') return 10000;
      return undefined;
    }),
  } as unknown as ConfigService;

  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockResolvedValue({ data: { data: { signalsLatest: {} } } }),
  } as never);

  const telemetry = new DimoTelemetryService(
    configService,
    createBypassExecutor(),
    gateway,
  );
  return { telemetry, executeSpy };
}

describe('DimoProvider requestContext propagation (P1-001)', () => {
  const fullContext = {
    organizationId: 'org-canary',
    vehicleId: 'veh-42',
    tokenId: 187336,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queryGraphQL forwards vehicle/org/token context to gateway', async () => {
    const { telemetry, executeSpy } = createPropagationHarness();

    await telemetry.queryGraphQL('jwt', 'query { x }', undefined, fullContext);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        requestContext: fullContext,
      }),
    );
  });

  it('fetchVehicleSummary forwards full context (not tokenId-only)', async () => {
    const { telemetry, executeSpy } = createPropagationHarness();

    await telemetry.fetchVehicleSummary('jwt', 187336, fullContext);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
        requestContext: fullContext,
      }),
    );
  });

  it('fetchVehicleVin forwards full context (not tokenId-only)', async () => {
    const { telemetry, executeSpy } = createPropagationHarness();

    await telemetry.fetchVehicleVin('jwt', 187336, fullContext);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_VIN,
        requestContext: fullContext,
      }),
    );
  });

  it('fetchLatestVehicleSnapshot merges tokenId with caller context', async () => {
    const { telemetry, executeSpy } = createPropagationHarness();

    await telemetry.fetchLatestVehicleSnapshot('jwt', 187336, {
      organizationId: fullContext.organizationId,
      vehicleId: fullContext.vehicleId,
    });

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: {
          organizationId: fullContext.organizationId,
          vehicleId: fullContext.vehicleId,
          tokenId: 187336,
        },
      }),
    );
  });
});

describe('DimoProviderGateway canary resolution across operations (P1-001)', () => {
  const limiter = {
    begin: jest.fn().mockResolvedValue({
      leaseId: null,
      inFlightMember: null,
      mode: 'enforce',
      rateDecision: DimoProviderLimiterDecision.ALLOW,
      inFlightDecision: DimoProviderLimiterDecision.ALLOW,
      rateWindowCount: 1,
      rateWindowLimit: 25,
      inFlightCount: 1,
      inFlightLimit: 40,
      redisFailOpen: false,
    }),
    end: jest.fn(),
    setProviderCooldown: jest.fn(),
  } as unknown as DimoProviderLimiterService;

  const admission = {
    acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
  } as unknown as DimoProviderAdmissionService;

  const config = percentCanaryConfig();
  const gateway = new DimoProviderGateway(config, admission, limiter);
  gateway.onModuleInit();

  const context = {
    organizationId: 'org-x',
    vehicleId: 'veh-percent-in',
    tokenId: 99,
  };

  it('TELEMETRY_GRAPHQL enforces when percent canary matches vehicleId', async () => {
    const acquire = jest.spyOn(admission, 'acquire');
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: context,
      invoke: async () => ({ ok: true }),
    });
    expect(acquire.mock.calls[0]?.[0]?.mode).toBe('enforce');
  });

  it('TELEMETRY_VEHICLE_SUMMARY enforces with same vehicle context', async () => {
    const acquire = jest.spyOn(admission, 'acquire');
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
      requestContext: context,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      invoke: async () => ({ data: {} }),
    });
    expect(acquire.mock.calls.at(-1)?.[0]?.mode).toBe('enforce');
  });

  it('missing vehicle/org context does not enter percent canary enforce', async () => {
    const acquire = jest.spyOn(admission, 'acquire');
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { tokenId: 99 },
      invoke: async () => ({ ok: true }),
    });
    expect(acquire.mock.calls.at(-1)?.[0]?.mode).toBe('shadow');
  });
});
