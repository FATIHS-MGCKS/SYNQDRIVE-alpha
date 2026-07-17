import {
  DrivingEventType,
  DimoBrakingEventIntakeStatus,
  HardwareType,
} from '@prisma/client';
import {
  assessDimoBrakingCapability,
  auditExistingDrivingEventMapping,
  buildDimoBrakingProviderEventId,
  buildDimoBrakingSourceFingerprint,
  DIMO_BRAKING_RAW_SOURCE_VERSION,
  parseDimoBrakingSample,
  splitTimeWindowForPagination,
  dedupeDimoEventSamples,
} from './dimo-braking-event-intake.domain';
import { DimoBrakingEventIntakeService } from './dimo-braking-event-intake.service';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';

const sample = (
  name: string,
  timestamp = '2026-06-26T12:00:00.000Z',
  source = '0xDEVICE',
): DimoVehicleEventRecord => ({
  timestamp,
  name,
  source,
  durationNs: 0,
  metadata: '{"counterValue":1}',
});

describe('dimo-braking-event-intake.domain', () => {
  it('maps harsh braking samples', () => {
    const parsed = parseDimoBrakingSample(sample('behavior.harshBraking'), 42, 'trip-1');
    expect(parsed?.eventType).toBe(DrivingEventType.HARSH_BRAKING);
    expect(parsed?.severity).toBe(0.6);
    expect(parsed?.dimoEventName).toBe('behavior.harshBraking');
  });

  it('maps extreme braking variants', () => {
    for (const name of [
      'behavior.extremeBraking',
      'behavior.extremeEmergency',
      'behavior.extremeEmergencyBraking',
    ]) {
      const parsed = parseDimoBrakingSample(sample(name), 42, 'trip-1');
      expect(parsed?.eventType).toBe(DrivingEventType.EXTREME_BRAKING);
      expect(parsed?.severity).toBe(0.9);
    }
  });

  it('builds stable providerEventId and fingerprint', () => {
    const providerEventId = buildDimoBrakingProviderEventId({
      tokenId: 7,
      timestamp: '2026-01-01T00:00:00.000Z',
      name: 'behavior.harshBraking',
      source: '0xA',
      durationNs: 0,
      counterValue: 1,
    });
    expect(providerEventId).toHaveLength(32);

    const fingerprint = buildDimoBrakingSourceFingerprint({
      providerEventId,
      rawSourceVersion: DIMO_BRAKING_RAW_SOURCE_VERSION,
      eventType: DrivingEventType.HARSH_BRAKING,
      severity: 0.6,
      tripId: 'trip-1',
    });
    expect(fingerprint).toHaveLength(24);
    expect(
      buildDimoBrakingSourceFingerprint({
        providerEventId,
        rawSourceVersion: DIMO_BRAKING_RAW_SOURCE_VERSION,
        eventType: DrivingEventType.HARSH_BRAKING,
        severity: 0.6,
        tripId: 'trip-1',
      }),
    ).toBe(fingerprint);
  });

  it('supports events without trip assignment', () => {
    const parsed = parseDimoBrakingSample(sample('behavior.harshBraking'), 1, null);
    expect(parsed?.providerEventId).toBeTruthy();
    expect(parsed?.sourceFingerprint).toHaveLength(24);
  });

  it('rejects unsupported providers via capability gate', () => {
    expect(
      assessDimoBrakingCapability({
        hardwareType: HardwareType.LTE_R1,
        provider: 'OTHER',
      }),
    ).toEqual({ allowed: false, reason: 'unsupported_provider' });
  });

  it('rejects non LTE_R1 hardware', () => {
    expect(
      assessDimoBrakingCapability({
        hardwareType: HardwareType.SMART5,
        provider: 'DIMO',
      }),
    ).toEqual({ allowed: false, reason: 'hardware_not_lte_r1' });
  });

  it('allows LTE_R1 with unknown historical availability', () => {
    expect(
      assessDimoBrakingCapability({
        hardwareType: HardwareType.LTE_R1,
        provider: 'DIMO',
      }),
    ).toEqual({ allowed: true, brakingEventsHistoricallyAvailable: 'unknown' });
  });

  it('paginates long windows and dedupes duplicate provider events', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-01T13:00:00.000Z');
    const windows = splitTimeWindowForPagination(from, to, 6 * 60 * 60 * 1000);
    expect(windows).toHaveLength(3);

    const duplicate = sample('behavior.harshBraking');
    const deduped = dedupeDimoEventSamples([duplicate, duplicate, duplicate], 9);
    expect(deduped).toHaveLength(1);
  });

  it('sorts out-of-order samples by dedupe key without dropping unique events', () => {
    const later = sample('behavior.harshBraking', '2026-06-26T12:05:00.000Z');
    const earlier = sample('behavior.extremeBraking', '2026-06-26T12:00:00.000Z');
    const deduped = dedupeDimoEventSamples([later, earlier], 1);
    expect(deduped).toHaveLength(2);
  });

  it('audits existing driving events against current mapping logic', () => {
    const results = auditExistingDrivingEventMapping([
      {
        id: 'de-1',
        eventType: DrivingEventType.EXTREME_BRAKING,
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        metadataJson: { dimoEventName: 'behavior.extremeBraking' },
      },
      {
        id: 'de-2',
        eventType: DrivingEventType.HARSH_BRAKING,
        recordedAt: new Date('2026-01-01T00:01:00.000Z'),
        metadataJson: { dimoEventName: 'behavior.harshBraking' },
      },
      {
        id: 'de-3',
        eventType: DrivingEventType.HARSH_ACCELERATION,
        recordedAt: new Date('2026-01-01T00:02:00.000Z'),
        metadataJson: { dimoEventName: 'behavior.harshBraking' },
      },
    ]);

    expect(results[0].matchesCurrentMapping).toBe(true);
    expect(results[1].matchesCurrentMapping).toBe(true);
    expect(results[2].matchesCurrentMapping).toBe(false);
  });
});

describe('DimoBrakingEventIntakeService', () => {
  function makeService(overrides?: {
    upsert?: jest.Mock;
    findFirst?: jest.Mock;
    segments?: Partial<{
      fetchDrivingEventsPaginated: jest.Mock;
      fetchEventDataSummary: jest.Mock;
    }>;
  }) {
    const prisma = {
      dimoBrakingEventIntake: {
        upsert: overrides?.upsert ?? jest.fn(async () => ({
          id: 'intake-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
      },
      vehicleTrip: {
        findFirst: overrides?.findFirst ?? jest.fn(async () => ({ id: 'trip-late' })),
      },
    };
    const segments = {
      fetchDrivingEventsPaginated:
        overrides?.segments?.fetchDrivingEventsPaginated ??
        jest.fn(async () => [sample('behavior.harshBraking')]),
      fetchEventDataSummary:
        overrides?.segments?.fetchEventDataSummary ?? jest.fn(async () => []),
    };
    const service = new DimoBrakingEventIntakeService(prisma as never, segments as never);
    return { service, prisma, segments };
  }

  it('ingests harsh braking as created', async () => {
    const { service } = makeService();
    const result = await service.ingestBrakingEvent({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      hardwareType: HardwareType.LTE_R1,
      tripId: 'trip-1',
      sample: sample('behavior.harshBraking'),
    });
    expect(result.outcome).toBe('created');
    expect(result.intakeId).toBe('intake-1');
  });

  it('treats repeated provider events as duplicate (idempotent)', async () => {
    const now = new Date('2026-01-02T00:00:00.000Z');
    const { service } = makeService({
      upsert: jest.fn(async () => ({
        id: 'intake-dup',
        createdAt: now,
        updatedAt: new Date(now.getTime() + 1000),
      })),
    });

    const result = await service.ingestBrakingEvent({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      hardwareType: HardwareType.LTE_R1,
      tripId: 'trip-1',
      sample: sample('behavior.harshBraking'),
    });
    expect(result.outcome).toBe('duplicate');
  });

  it('skips wrong vehicle assignments', async () => {
    const { service } = makeService();
    const result = await service.ingestBrakingEvent({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      hardwareType: HardwareType.LTE_R1,
      expectedVehicleId: 'veh-b',
      tripId: 'trip-1',
      sample: sample('behavior.harshBraking'),
    });
    expect(result.outcome).toBe('skipped_wrong_vehicle');
  });

  it('isolates multi-tenant intake by organizationId on create', async () => {
    const upsert = jest.fn(async (args: any) => ({
      id: 'intake-tenant',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const { service } = makeService({ upsert });

    await service.ingestBrakingEvent({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-tenant-a',
      hardwareType: HardwareType.LTE_R1,
      tripId: 'trip-1',
      sample: sample('behavior.extremeBraking'),
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
  });

  it('resolves delayed events to the active trip window', async () => {
    const { service, prisma } = makeService();
    const tripId = await service.resolveTripId(
      'veh-a',
      new Date('2026-06-26T12:10:00.000Z'),
    );
    expect(tripId).toBe('trip-late');
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalled();
  });

  it('delegates paginated fetch to the DIMO segments service', async () => {
    const fetchDrivingEventsPaginated = jest.fn(async () => [sample('behavior.harshBraking')]);
    const { service, segments } = makeService({ segments: { fetchDrivingEventsPaginated } });
    const events = await service.fetchDrivingEventsPaginated(
      1,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T01:00:00.000Z'),
    );
    expect(segments.fetchDrivingEventsPaginated).toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it('batch intake counts created vs duplicate separately', async () => {
    const now = new Date('2026-01-03T00:00:00.000Z');
    const upsert = jest
      .fn()
      .mockResolvedValueOnce({ id: 'a', createdAt: now, updatedAt: now })
      .mockResolvedValueOnce({
        id: 'b',
        createdAt: now,
        updatedAt: new Date(now.getTime() + 500),
      });

    const { service } = makeService({ upsert });
    const result = await service.ingestBrakingBatch({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      hardwareType: HardwareType.LTE_R1,
      tripId: 'trip-1',
      samples: [
        sample('behavior.harshBraking'),
        sample('behavior.extremeBraking', '2026-06-26T12:01:00.000Z'),
      ],
    });

    expect(result.created).toBe(1);
    expect(result.duplicate).toBe(1);
    expect(result.parsed).toHaveLength(2);
  });

  it('marks unsupported hardware in batch as skipped without prisma writes for non-braking', async () => {
    const upsert = jest.fn();
    const { service } = makeService({ upsert });
    const result = await service.ingestBrakingBatch({
      tokenId: 1,
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      hardwareType: HardwareType.SMART5,
      tripId: 'trip-1',
      samples: [sample('behavior.harshAcceleration')],
    });
    expect(result.skipped).toBe(1);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('DimoBrakingEventIntakeService.syncBrakingDrivingEventsForTrip', () => {
  it('links intake rows to persisted driving events', async () => {
    const providerEventId = buildDimoBrakingProviderEventId({
      tokenId: 1,
      timestamp: '2026-06-26T12:00:00.000Z',
      name: 'behavior.harshBraking',
      source: '0xDEVICE',
      durationNs: 0,
      counterValue: 1,
    });

    const prisma = {
      dimoBrakingEventIntake: {
        findMany: jest.fn(async () => [
          { id: 'intake-1', providerEventId, drivingEventId: null },
        ]),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      drivingEvent: {
        create: jest.fn(async () => ({ id: 'de-1' })),
        update: jest.fn(),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    const service = new DimoBrakingEventIntakeService(prisma as never, {} as never);
    const result = await service.syncBrakingDrivingEventsForTrip({
      tripId: 'trip-1',
      vehicleId: 'veh-a',
      organizationId: 'org-a',
      normalizedEvents: [
        {
          providerEventId,
          eventType: DrivingEventType.HARSH_BRAKING,
          recordedAt: new Date('2026-06-26T12:00:00.000Z'),
          severity: 0.6,
          speedKmh: null,
          metadataJson: {
            provider: 'DIMO',
            providerEventId,
            dimoEventName: 'behavior.harshBraking',
          },
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(prisma.dimoBrakingEventIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          drivingEventId: 'de-1',
          processingStatus: DimoBrakingEventIntakeStatus.PROCESSED,
        }),
      }),
    );
  });
});
