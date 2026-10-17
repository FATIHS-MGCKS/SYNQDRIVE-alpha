import { BatteryMeasurementQuality } from '@prisma/client';
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
  };
});

import { isBatteryV2HvChargingCounterBucketCaptureEnabled } from '@config/battery-health-v2.config';

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
    energyAddedKwh: 18.66,
    quality: BatteryMeasurementQuality.SHADOW,
    ...overrides,
  } as never;
}

describe('hv-charging-counter-evidence (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isBatteryV2HvChargingCounterBucketCaptureEnabled as jest.Mock).mockReturnValue(false);
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
    const intervalClient = { fetchIntervalBuckets: jest.fn() };
    const repository = {
      findLatestBatchForSegment: jest.fn(),
      findBatchByIdempotency: jest.fn(),
      persistBatch: jest.fn(),
    };
    const prisma = { vehicle: { findFirst: jest.fn() } };
    const capture = new HvChargingCounterEvidenceCaptureService(
      prisma as never,
      repository as never,
      intervalClient as never,
    );

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
    const intervalClient = {
      fetchIntervalBuckets: jest
        .fn()
        .mockRejectedValue(new Error('429 rate limit exceeded')),
    };
    const repository = {
      findLatestBatchForSegment: jest.fn().mockResolvedValue(null),
      findBatchByIdempotency: jest.fn(),
      persistBatch: jest.fn(),
    };
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ dimoVehicle: { tokenId: 186946 } }),
      },
    };
    const capture = new HvChargingCounterEvidenceCaptureService(
      prisma as never,
      repository as never,
      intervalClient as never,
    );

    const result = await capture.captureForSession({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(),
    });
    expect(result.skipReason).toBe('rate_limited');
    expect(repository.persistBatch).not.toHaveBeenCalled();
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
