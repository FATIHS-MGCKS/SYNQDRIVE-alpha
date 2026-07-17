import { Logger } from '@nestjs/common';
import { DimoTelemetryService } from '../dimo-telemetry.service';
import { executeDimoRechargeSegmentsGraphQL } from './dimo-recharge-segments.graphql';
import { buildDimoRechargeSegmentsQuery } from './dimo-recharge-segments.query';
import { normalizeDimoRechargeSegment } from './dimo-recharge-segments.normalizer';
import { splitDimoRechargeQueryWindows } from './dimo-recharge-segments.window';
import {
  TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from './dimo-recharge-segments.fixtures';

describe('dimo-recharge-segments normalizer', () => {
  it('normalizes KS FH 660E audit segment with SOC, energy, and added energy', () => {
    const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
    const normalized = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw);

    expect(normalized).not.toBeNull();
    expect(normalized!.providerSegmentId).toBe('seg-audit-ksfh-1');
    expect(normalized!.segmentId).toBe('seg-audit-ksfh-1');
    expect(normalized!.startAt).toBe('2026-06-15T17:47:29.000Z');
    expect(normalized!.endAt).toBe('2026-06-16T10:39:23.000Z');
    expect(normalized!.ongoing).toBe(false);
    expect(normalized!.soc.min).toBe(41.2);
    expect(normalized!.soc.max).toBe(48.5);
    expect(normalized!.soc.delta).toBeCloseTo(7.3, 1);
    expect(normalized!.currentEnergyKwh.delta).toBeCloseTo(3.64, 2);
    expect(normalized!.addedEnergyKwh.delta).toBeCloseTo(13.92, 2);
    expect(normalized!.isCharging.start).toBe(false);
    expect(normalized!.isCharging.end).toBe(true);
    expect(normalized!.sourceTimestamps.segmentStartAt).toBe(
      '2026-06-15T17:47:29.000Z',
    );
  });

  it('uses stable fingerprint when provider segment id is missing', () => {
    const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1];
    const normalized = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw);

    expect(normalized!.providerSegmentId).toBeNull();
    expect(normalized!.fingerprint).toBe(
      `dimo-recharge-${TESLA_RECHARGE_AUDIT_TOKEN_ID}-${new Date('2026-06-17T13:52:22.000Z').getTime()}`,
    );
    expect(normalized!.segmentId).toBe(normalized!.fingerprint);
  });

  it('normalizes ongoing segment with null endAt', () => {
    const raw = TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT.data.segments[0];
    const normalized = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw);

    expect(normalized!.ongoing).toBe(true);
    expect(normalized!.endAt).toBeNull();
    expect(normalized!.sourceTimestamps.segmentEndAt).toBeNull();
    expect(normalized!.isCharging.start).toBe(true);
    expect(normalized!.isCharging.end).toBe(true);
  });
});

describe('dimo-recharge-segments window splitting', () => {
  it('keeps ranges within 31-day DIMO limit', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-15T00:00:00.000Z');
    const windows = splitDimoRechargeQueryWindows(from, to);

    expect(windows.length).toBeGreaterThan(1);
    for (const window of windows) {
      const spanMs = window.to.getTime() - window.from.getTime();
      expect(spanMs).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
      expect(spanMs).toBeGreaterThan(0);
    }
    expect(windows[0].from).toEqual(from);
    expect(windows[windows.length - 1].to).toEqual(to);
  });
});

describe('dimo-recharge-segments query builder', () => {
  it('includes mechanism recharge, pagination, and HV aggregates', () => {
    const query = buildDimoRechargeSegmentsQuery({
      tokenId: 186946,
      fromIso: '2026-06-15T00:00:00.000Z',
      toIso: '2026-07-16T00:00:00.000Z',
      afterIso: '2026-06-18T05:05:33.000Z',
      limit: 50,
      sourceFilter: 'tesla',
    });

    expect(query).toContain('mechanism: recharge');
    expect(query).toContain('after: "2026-06-18T05:05:33.000Z"');
    expect(query).toContain('limit: 50');
    expect(query).toContain('signalFilter: { source: { eq: "tesla" } }');
    expect(query).toContain('powertrainTractionBatteryChargingAddedEnergy');
    expect(query).toContain('powertrainTractionBatteryChargingIsCharging');
  });
});

describe('executeDimoRechargeSegmentsGraphQL', () => {
  const logger = new Logger('test');
  const vehicleJwt = 'sanitized-vehicle-jwt-not-logged';

  it('retries on HTTP 429 and succeeds', async () => {
    const telemetry = {
      queryGraphQL: jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce(TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1),
    } as unknown as DimoTelemetryService;

    const result = await executeDimoRechargeSegmentsGraphQL(
      telemetry,
      logger,
      vehicleJwt,
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      () =>
        buildDimoRechargeSegmentsQuery({
          tokenId: TESLA_RECHARGE_AUDIT_TOKEN_ID,
          fromIso: '2026-06-15T00:00:00.000Z',
          toIso: '2026-07-16T00:00:00.000Z',
        }),
      { baseDelayMs: 1 },
    );

    expect(result.retries).toBe(1);
    expect(result.data.segments).toHaveLength(3);
    expect(telemetry.queryGraphQL).toHaveBeenCalledTimes(2);
  });

  it('drops unsupported source filter and retries without it', async () => {
    const telemetry = {
      queryGraphQL: jest
        .fn()
        .mockRejectedValueOnce(new Error('Unknown argument "signalFilter"'))
        .mockResolvedValueOnce(TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2),
    } as unknown as DimoTelemetryService;

    const result = await executeDimoRechargeSegmentsGraphQL(
      telemetry,
      logger,
      vehicleJwt,
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      (withSourceFilter) =>
        buildDimoRechargeSegmentsQuery({
          tokenId: TESLA_RECHARGE_AUDIT_TOKEN_ID,
          fromIso: '2026-06-15T00:00:00.000Z',
          toIso: '2026-07-16T00:00:00.000Z',
          sourceFilter: withSourceFilter ? 'tesla' : null,
        }),
      { baseDelayMs: 1 },
    );

    expect(result.sourceFilterDropped).toBe(true);
    expect(result.data.segments).toHaveLength(1);
    expect(telemetry.queryGraphQL).toHaveBeenCalledTimes(2);
  });
});

describe('DimoRechargeSegmentsClient', () => {
  const dimoAuth = { getVehicleJwt: jest.fn() };
  const dimoTelemetry = { queryGraphQL: jest.fn() };
  const prisma = { vehicle: { findFirst: jest.fn() } };

  beforeEach(() => {
    jest.resetAllMocks();
    dimoAuth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
  });

  it('paginates recharge segments across pages', async () => {
    dimoTelemetry.queryGraphQL
      .mockResolvedValueOnce(TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1)
      .mockResolvedValueOnce(TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2);

    const { DimoRechargeSegmentsClient } = await import('./dimo-recharge-segments.client');
    const client = new DimoRechargeSegmentsClient(
      prisma as never,
      dimoAuth as never,
      dimoTelemetry as never,
    );

    const result = await client.fetchForToken(
      TESLA_RECHARGE_AUDIT_TOKEN_ID,
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-07-16T00:00:00.000Z'),
      { pageLimit: 3 },
    );

    expect(result.segments).toHaveLength(4);
    expect(result.meta.pagesFetched).toBe(2);
    expect(result.segments[3].soc.delta).toBeCloseTo(27.4, 1);
    expect(dimoTelemetry.queryGraphQL).toHaveBeenCalledTimes(2);
  });

  it('returns null for tenant vehicle without DIMO token', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: null });

    const { DimoRechargeSegmentsClient } = await import('./dimo-recharge-segments.client');
    const client = new DimoRechargeSegmentsClient(
      prisma as never,
      dimoAuth as never,
      dimoTelemetry as never,
    );

    const result = await client.fetchForVehicle(
      { organizationId: 'org-1', vehicleId: 'veh-1' },
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(result).toBeNull();
    expect(dimoAuth.getVehicleJwt).not.toHaveBeenCalled();
  });

  it('scopes tenant vehicle lookup to organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      dimoVehicle: { tokenId: TESLA_RECHARGE_AUDIT_TOKEN_ID },
    });
    dimoTelemetry.queryGraphQL.mockResolvedValue(TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1);

    const { DimoRechargeSegmentsClient } = await import('./dimo-recharge-segments.client');
    const client = new DimoRechargeSegmentsClient(
      prisma as never,
      dimoAuth as never,
      dimoTelemetry as never,
    );

    await client.fetchForVehicle(
      { organizationId: 'org-audit', vehicleId: 'veh-audit' },
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'veh-audit', organizationId: 'org-audit' },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    expect(dimoAuth.getVehicleJwt).toHaveBeenCalledWith(TESLA_RECHARGE_AUDIT_TOKEN_ID);
  });
});
