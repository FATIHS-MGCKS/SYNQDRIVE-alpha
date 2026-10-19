import { BatteryMeasurementQuality, type HvChargeSession } from '@prisma/client';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HvChargingCounterEvidenceCaptureService } from './hv-charging-counter-evidence.capture.service';
import { computeHvChargingCounterObservationSetFingerprintV1 } from './hv-charging-counter-evidence.fingerprint.v1';
import { mapDimoIntervalRowsToBucketInputsV1 } from './hv-charging-counter-evidence.mapper.v1';
import { HV_CHARGING_COUNTER_SAMPLE_CLASS } from './hv-charging-counter-evidence.constants.v1';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2HvChargingCounterBucketCaptureEnabled: jest.fn(),
    isBatteryV2HvChargingCounterVehicleAllowlisted: jest.fn(),
    getBatteryV2HvChargingCounterVehicleAllowlistState: jest.fn(),
    getBatteryV2HvChargingCounterRevalidationIntervalMs: jest.fn().mockReturnValue(6 * 60 * 60 * 1000),
  };
});

import {
  getBatteryV2HvChargingCounterVehicleAllowlistState,
  isBatteryV2HvChargingCounterBucketCaptureEnabled,
  isBatteryV2HvChargingCounterVehicleAllowlisted,
} from '@config/battery-health-v2.config';

const ORG = '11111111-1111-4111-8111-111111111111';
const VEH = '22222222-2222-4222-8222-222222222222';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    organizationId: ORG,
    vehicleId: VEH,
    segmentFingerprint: 'dimo-recharge-186946-1792156502931',
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt: new Date('2026-10-16T13:15:02.931Z'),
    endAt: new Date('2026-10-16T19:52:53.932Z'),
    isOngoing: false,
    providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
    updatedAt: new Date('2026-10-16T19:52:53.932Z'),
    energyAddedKwh: 18.66,
    quality: BatteryMeasurementQuality.SHADOW,
    ...overrides,
  } as HvChargeSession;
}

function buildCapture() {
  const intervalClient = { fetchIntervalBuckets: jest.fn() };
  const repository = {
    findLatestBatchForSegment: jest.fn(),
    findRevalidationCheckpoint: jest.fn().mockResolvedValue(null),
    recordProviderRevalidationCheckpoint: jest.fn().mockResolvedValue(undefined),
    findBatchByIdempotency: jest.fn(),
    persistBatch: jest.fn(),
  };
  const prisma = { vehicle: { findFirst: jest.fn() } };
  const capture = new HvChargingCounterEvidenceCaptureService(
    prisma as never,
    repository as never,
    intervalClient as never,
  );
  return { capture, intervalClient, repository, prisma };
}

describe('hv-charging-counter-evidence (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(false);
    (isBatteryV2HvChargingCounterVehicleAllowlisted as jest.Mock).mockImplementation(
      (vehicleId: string) => vehicleId === VEH,
    );
    (getBatteryV2HvChargingCounterVehicleAllowlistState as jest.Mock).mockReturnValue({
      kind: 'allow_set',
      vehicleIds: new Set([VEH]),
    });
  });

  it('maps DIMO interval rows with MISSING buckets and NOT_RAW_NATIVE_SAMPLE provenance class constant', () => {
    const buckets = mapDimoIntervalRowsToBucketInputsV1([
      {
        timestamp: '2026-10-16T13:15:02.931Z',
        addedKwhLast: 0,
        addedKwhMin: 0,
        addedKwhMax: 0,
      },
      { timestamp: '2026-10-16T13:16:02.931Z', addedKwhLast: null },
    ]);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].availability).toBe('AVAILABLE');
    expect(buckets[1].availability).toBe('MISSING');
    expect(HV_CHARGING_COUNTER_SAMPLE_CLASS).toBe('NOT_RAW_NATIVE_SAMPLE');
  });

  it('flag OFF: capture does not call interval client', async () => {
    const { capture, intervalClient, repository } = buildCapture();
    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });
    expect(result).toEqual({ skipped: true, skipReason: 'disabled' });
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('rate-limited provider errors fail closed without throwing', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    repository.findLatestBatchForSegment.mockResolvedValue(null);
    intervalClient.fetchIntervalBuckets.mockRejectedValue(new Error('429 rate limit exceeded'));
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });
    expect(result.skipReason).toBe('rate_limited');
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('skips DIMO query within revalidation window when session identity unchanged', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository } = buildCapture();
    const session = sessionRow();
    repository.findLatestBatchForSegment.mockResolvedValue({
      id: 'batch-1',
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      createdAt: new Date('2026-10-16T20:00:00.000Z'),
      observationSetFingerprint: 'fp-old',
    });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      persistResult: { changed: false, changeKind: 'no_op' },
      evaluatedAt: new Date('2026-10-16T21:00:00.000Z'),
    });

    expect(result.skipReason).toBe('unchanged_within_revalidation_window');
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('re-queries after revalidation interval to allow corrected bucket discovery', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    const session = sessionRow();
    repository.findLatestBatchForSegment.mockResolvedValue({
      id: 'batch-1',
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      createdAt: new Date('2026-10-16T10:00:00.000Z'),
      observationSetFingerprint: 'fp-old',
    });
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({
      status: 'success',
      rows: [{ timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0.5 }],
    });
    repository.findBatchByIdempotency.mockResolvedValue(null);
    repository.persistBatch.mockResolvedValue({
      created: true,
      batchId: 'batch-2',
      observationsInserted: 1,
      revisionsCreated: 1,
    });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      persistResult: { changed: false, changeKind: 'no_op' },
      evaluatedAt: new Date('2026-10-17T10:00:00.000Z'),
    });

    expect(intervalClient.fetchIntervalBuckets).toHaveBeenCalled();
    expect(result.skipped).toBe(false);
    expect(result.revisionsCreated).toBe(1);
  });

  it('queries immediately when persist result changed even inside revalidation window', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    const session = sessionRow();
    repository.findLatestBatchForSegment.mockResolvedValue({
      id: 'batch-1',
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      createdAt: new Date('2026-10-16T20:00:00.000Z'),
      observationSetFingerprint: 'fp-old',
    });
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({
      status: 'success',
      rows: [{ timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0 }],
    });
    repository.findBatchByIdempotency.mockResolvedValue(null);
    repository.persistBatch.mockResolvedValue({
      created: true,
      batchId: 'batch-2',
      observationsInserted: 1,
      revisionsCreated: 1,
    });

    await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      persistResult: { changed: true, changeKind: 'provider_refresh' },
      evaluatedAt: new Date('2026-10-16T20:30:00.000Z'),
    });

    expect(intervalClient.fetchIntervalBuckets).toHaveBeenCalled();
  });

  it('does not persist batch for empty interval series', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    repository.findLatestBatchForSegment.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({
      status: 'empty_interval_series',
      rows: [],
    });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });

    expect(result.skipReason).toBe('provider_empty_intervals');
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('distinguishes no vehicle JWT from provider error', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    repository.findLatestBatchForSegment.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({
      status: 'no_vehicle_jwt',
      rows: [],
    });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });
    expect(result.skipReason).toBe('no_dimo_token');
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('P1.2: session updated after batch then duplicate revalidate blocks next scheduler DIMO query', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const tSessionEdit = new Date('2026-10-16T12:00:00.000Z');
    const tRevalidate = new Date('2026-10-16T12:30:00.000Z');
    const tTick = new Date('2026-10-16T12:35:00.000Z');
    const session = sessionRow({ updatedAt: tSessionEdit });
    const rows = [{ timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0 }];

    repository.findLatestBatchForSegment.mockResolvedValue({
      id: 'batch-t0',
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      createdAt: t0,
      observationSetFingerprint: 'fp-t0',
    });
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({ status: 'success', rows });
    repository.findBatchByIdempotency.mockResolvedValue({ id: 'batch-t0' });

    await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      evaluatedAt: tRevalidate,
    });

    repository.findRevalidationCheckpoint.mockResolvedValue({
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      lastProviderQueryAt: tRevalidate,
    });
    intervalClient.fetchIntervalBuckets.mockClear();

    const tick = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      evaluatedAt: tTick,
    });

    expect(tick.skipReason).toBe('unchanged_within_revalidation_window');
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('records revalidation checkpoint on duplicate batch and blocks repeat query within interval', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    const { capture, intervalClient, repository, prisma } = buildCapture();
    const session = sessionRow({
      updatedAt: new Date('2026-10-16T09:00:00.000Z'),
    });
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const t0Plus6h = new Date('2026-10-16T16:00:00.000Z');
    const t0Plus6h5m = new Date('2026-10-16T16:05:00.000Z');
    const rows = [{ timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0 }];

    repository.findLatestBatchForSegment.mockResolvedValue({
      id: 'batch-t0',
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      createdAt: t0,
      observationSetFingerprint: 'fp-t0',
    });
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({ status: 'success', rows });
    repository.findBatchByIdempotency.mockResolvedValue({ id: 'batch-t0' });

    const first = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      evaluatedAt: t0Plus6h,
    });
    expect(first.skipReason).toBe('duplicate_batch');
    expect(repository.recordProviderRevalidationCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ queriedAt: t0Plus6h }),
    );

    repository.findRevalidationCheckpoint.mockResolvedValue({
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      lastProviderQueryAt: t0Plus6h,
    });
    intervalClient.fetchIntervalBuckets.mockClear();

    const second = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session,
      evaluatedAt: t0Plus6h5m,
    });
    expect(second.skipReason).toBe('unchanged_within_revalidation_window');
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('global flag ON with empty allowlist denies capture before repository access', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    (getBatteryV2HvChargingCounterVehicleAllowlistState as jest.Mock).mockReturnValue({
      kind: 'deny_all',
      reason: 'missing_or_empty',
    });
    (isBatteryV2HvChargingCounterVehicleAllowlisted as jest.Mock).mockReturnValue(false);
    const { capture, intervalClient, repository } = buildCapture();

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });

    expect(result).toEqual({ skipped: true, skipReason: 'vehicle_not_allowlisted' });
    expect(repository.findLatestBatchForSegment).not.toHaveBeenCalled();
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('allows Tesla vehicle when explicitly allowlisted', async () => {
    const teslaId = '68868291-5478-42cd-b0c4-cc77b2a78e21';
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    (isBatteryV2HvChargingCounterVehicleAllowlisted as jest.Mock).mockImplementation(
      (id: string) => id === teslaId,
    );
    const { capture, intervalClient, repository, prisma } = buildCapture();
    repository.findLatestBatchForSegment.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue({ dimoVehicle: { tokenId: 186946 } });
    intervalClient.fetchIntervalBuckets.mockResolvedValue({
      status: 'empty_interval_series',
      rows: [],
    });

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: teslaId,
      session: sessionRow({ vehicleId: teslaId }),
    });

    expect(result.skipReason).toBe('provider_empty_intervals');
    expect(intervalClient.fetchIntervalBuckets).toHaveBeenCalled();
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('rejects non-allowlisted vehicle without provider or persist', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    (isBatteryV2HvChargingCounterVehicleAllowlisted as jest.Mock).mockReturnValue(false);
    const otherVehicle = '33333333-3333-4333-8333-333333333333';
    const { capture, intervalClient, repository } = buildCapture();

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: otherVehicle,
      session: sessionRow({ vehicleId: otherVehicle }),
    });

    expect(result).toEqual({ skipped: true, skipReason: 'vehicle_not_allowlisted' });
    expect(repository.findLatestBatchForSegment).not.toHaveBeenCalled();
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('invalid allowlist configuration fails closed with allowlist_invalid', async () => {
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(true);
    (getBatteryV2HvChargingCounterVehicleAllowlistState as jest.Mock).mockReturnValue({
      kind: 'deny_all',
      reason: 'invalid_entries',
    });
    const { capture, intervalClient, repository } = buildCapture();

    const result = await capture.captureForPersistResults({
      organizationId: ORG,
      vehicleId: VEH,
      results: [
        {
          session: sessionRow(),
          created: false,
          changed: false,
          changeKind: 'no_op',
        },
      ],
    });

    expect(result[0]).toEqual({ skipped: true, skipReason: 'allowlist_invalid' });
    expect(repository.findLatestBatchForSegment).not.toHaveBeenCalled();
    expect(intervalClient.fetchIntervalBuckets).not.toHaveBeenCalled();
  });

  it('observation set fingerprint is stable for identical bucket inputs', () => {
    const buckets = mapDimoIntervalRowsToBucketInputsV1([
      { timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0 },
      { timestamp: '2026-10-16T13:16:02.931Z', addedKwhLast: 1.5 },
    ]);
    const a = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    const b = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
