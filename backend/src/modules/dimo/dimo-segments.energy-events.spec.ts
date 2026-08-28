import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoSegmentsService } from './dimo-segments.service';
import { DimoRechargeSegmentsClient } from './recharge-segments/dimo-recharge-segments.client';
import { buildEnergyEventSegmentsQuery } from './queries/energy-event-segments.query';
import { DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG } from './energy-events/dimo-energy-detector.config';
import { isRetryableDimoAxiosError } from './recharge-segments/dimo-recharge-segments.graphql';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from './recharge-segments/dimo-recharge-segments.fixtures';
import { mapRechargeSegmentToEnergyEvent } from './recharge-segments/dimo-recharge-segments.mapper';
import { normalizeDimoRechargeSegments } from './recharge-segments/dimo-recharge-segments.normalizer';

const TOKEN_ID = 187336;
const FROM = new Date('2026-08-22T00:00:00.000Z');
const TO = new Date('2026-08-24T00:00:00.000Z');

function buildRefuelSegment() {
  return {
    start: {
      timestamp: '2026-08-23T16:15:15.000Z',
      value: { latitude: 51.31, longitude: 9.49 },
    },
    end: {
      timestamp: '2026-08-23T16:23:16.000Z',
      value: { latitude: 51.31, longitude: 9.49 },
    },
    duration: 481,
    isOngoing: false,
    startedBeforeRange: false,
    signals: [
      { name: 'powertrainFuelSystemAbsoluteLevel', value: 8 },
      { name: 'powertrainFuelSystemAbsoluteLevel', value: 26 },
      { name: 'powertrainFuelSystemRelativeLevel', value: 13 },
      { name: 'powertrainFuelSystemRelativeLevel', value: 42 },
      { name: 'powertrainTransmissionTravelledDistance', value: 12000 },
      { name: 'powertrainTransmissionTravelledDistance', value: 12000 },
    ],
  };
}

describe('DimoSegmentsService.fetchEnergyEventSegments isolation', () => {
  const auth = { getVehicleJwt: jest.fn() };
  const telemetry = { queryGraphQL: jest.fn() };
  const rechargeClient = { fetchForToken: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    auth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
  });

  function createService() {
    return new DimoSegmentsService(
      auth as never,
      telemetry as never,
      rechargeClient as unknown as DimoRechargeSegmentsClient,
    );
  }

  it('returns refuel segments when recharge fails with HTTP 422', async () => {
    telemetry.queryGraphQL.mockResolvedValue({
      data: { segments: [buildRefuelSegment()] },
    });
    rechargeClient.fetchForToken.mockResolvedValue({
      segments: [],
      meta: {
        tokenId: TOKEN_ID,
        status: 'FAILED',
        requestedFrom: FROM.toISOString(),
        requestedTo: TO.toISOString(),
        windowsQueried: 1,
        queriesExecuted: 1,
        sourceFilterApplied: null,
        sourceFilterDropped: false,
        retries: 0,
      },
      error: {
        message: 'Request failed with status code 422',
        httpStatus: 422,
        retryable: false,
      },
    });

    const service = createService();
    const result = await service.fetchEnergyEventSegments(TOKEN_ID, FROM, TO);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].mechanism).toBe('refuel');
    expect(result.outcomes.find((o) => o.mechanism === 'refuel')?.status).toBe(
      'SUCCESS_WITH_EVENTS',
    );
    expect(result.outcomes.find((o) => o.mechanism === 'recharge')?.status).toBe(
      'FAILED',
    );
  });

  it('returns recharge segments when refuel fails', async () => {
    telemetry.queryGraphQL.mockRejectedValue({
      response: { status: 422, data: { errors: [{ message: 'validation failed' }] } },
      message: 'Request failed with status code 422',
    });
    const normalized = normalizeDimoRechargeSegments(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      [...TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments],
    );
    rechargeClient.fetchForToken.mockResolvedValue({
      segments: normalized,
      meta: {
        tokenId: TOKEN_ID,
        status: 'SUCCESS',
        requestedFrom: FROM.toISOString(),
        requestedTo: TO.toISOString(),
        windowsQueried: 1,
        queriesExecuted: 1,
        sourceFilterApplied: null,
        sourceFilterDropped: false,
        retries: 0,
      },
    });

    const service = createService();
    const result = await service.fetchEnergyEventSegments(TOKEN_ID, FROM, TO);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments.every((segment) => segment.mechanism === 'recharge')).toBe(
      true,
    );
    expect(result.outcomes.find((o) => o.mechanism === 'refuel')?.status).toBe('FAILED');
    expect(result.outcomes.find((o) => o.mechanism === 'recharge')?.status).toBe(
      'SUCCESS_WITH_EVENTS',
    );
  });

  it('marks both mechanisms FAILED without mixing segments when both fail', async () => {
    telemetry.queryGraphQL.mockRejectedValue({
      response: { status: 422 },
      message: 'Request failed with status code 422',
    });
    rechargeClient.fetchForToken.mockResolvedValue({
      segments: [],
      meta: {
        tokenId: TOKEN_ID,
        status: 'FAILED',
        requestedFrom: FROM.toISOString(),
        requestedTo: TO.toISOString(),
        windowsQueried: 1,
        queriesExecuted: 1,
        sourceFilterApplied: null,
        sourceFilterDropped: false,
        retries: 0,
      },
      error: {
        message: 'Request failed with status code 422',
        httpStatus: 422,
        retryable: false,
      },
    });

    const service = createService();
    const result = await service.fetchEnergyEventSegments(TOKEN_ID, FROM, TO);

    expect(result.segments).toEqual([]);
    expect(result.outcomes.every((outcome) => outcome.status === 'FAILED')).toBe(true);
  });

  it('uses the refuel query shape without unsupported pagination fields', async () => {
    telemetry.queryGraphQL.mockResolvedValue({ data: { segments: [] } });
    rechargeClient.fetchForToken.mockResolvedValue({
      segments: [],
      meta: {
        tokenId: TOKEN_ID,
        status: 'SUCCESS',
        requestedFrom: FROM.toISOString(),
        requestedTo: TO.toISOString(),
        windowsQueried: 1,
        queriesExecuted: 1,
        sourceFilterApplied: null,
        sourceFilterDropped: false,
        retries: 0,
      },
    });

    const service = createService();
    await service.fetchEnergyEventSegments(TOKEN_ID, FROM, TO);

    const refuelQuery = telemetry.queryGraphQL.mock.calls[0][1] as string;
    expect(refuelQuery).toBe(
      buildEnergyEventSegmentsQuery(TOKEN_ID, FROM, TO, 'refuel', DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG),
    );
    expect(refuelQuery).toContain('config: { minIncreasePercent: 5 }');
    expect(refuelQuery).not.toMatch(/\blimit\s*:/);
    expect(refuelQuery).not.toMatch(/\bafter\s*:/);
  });
});

describe('mapRechargeSegmentToEnergyEvent idempotency', () => {
  it('produces stable segment ids from normalized recharge segments', () => {
    const normalized = normalizeDimoRechargeSegments(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      [...TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments],
    );
    const mapped = normalized.map(mapRechargeSegmentToEnergyEvent);
    const remapped = normalized.map(mapRechargeSegmentToEnergyEvent);
    expect(mapped.map((row) => row.segmentId)).toEqual(
      remapped.map((row) => row.segmentId),
    );
  });
});

describe('executeDimoRechargeSegmentsGraphQL retry classification', () => {
  it('classifies HTTP 422 as non-retryable', () => {
    expect(
      isRetryableDimoAxiosError({
        response: { status: 422 },
        message: 'Request failed with status code 422',
      }),
    ).toBe(false);
  });

  it('classifies HTTP 429 as retryable', () => {
    expect(isRetryableDimoAxiosError({ response: { status: 429 } })).toBe(true);
  });
});
