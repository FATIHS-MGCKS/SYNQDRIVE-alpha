import { BatteryV2SnapshotIngestionService } from './battery-v2-snapshot-ingestion.service';

describe('BatteryV2SnapshotIngestionService', () => {
  const basePayload = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    idempotencyKey: 'obs:veh-1:lv:1',
    snapshotContext: {
      lvBatteryVoltage: 12.5,
      lvBatteryObservedAt: new Date().toISOString(),
      providerFetchedAt: new Date().toISOString(),
      evSoc: null,
      tractionBatteryIsCharging: null,
    },
  } as const;

  function buildService() {
    const prisma = {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({ tractionBatteryIsCharging: false }),
      },
    };
    const batteryV2 = {
      onSnapshot: jest.fn().mockResolvedValue({
        restCaptured: true,
        capturedAt: new Date('2026-07-16T10:00:00.000Z'),
      }),
    };
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('job-1'),
    };
    const deadLetters = {
      isDeadLetter: jest.fn().mockResolvedValue(false),
    };
    const lvRestBridge = {
      processObservationCycle: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BatteryV2SnapshotIngestionService(
      prisma as any,
      batteryV2 as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      jobProducer as any,
      deadLetters as any,
      lvRestBridge as any,
    );

    return { service, batteryV2, jobProducer, deadLetters, lvRestBridge };
  }

  it('enqueues LV assessment recompute after rest capture (B-01)', async () => {
    const { service, jobProducer } = buildService();

    await service.ingestObservationClassify(basePayload as any);

    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        assessmentType: 'LV_HEALTH',
      }),
    );
  });

  it('skips assessment enqueue when rest was not captured', async () => {
    const { service, batteryV2, jobProducer } = buildService();
    batteryV2.onSnapshot.mockResolvedValue({ restCaptured: false });

    await service.ingestObservationClassify(basePayload as any);

    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('invokes canonical LV REST bridge on every observation classify (I)', async () => {
    const { service, lvRestBridge } = buildService();

    await service.ingestObservationClassify(basePayload as any);

    expect(lvRestBridge.processObservationCycle).toHaveBeenCalledWith(
      'org-1',
      'veh-1',
      basePayload.snapshotContext,
    );
  });

  it('still runs legacy onSnapshot when LV voltage is present (I)', async () => {
    const { service, batteryV2 } = buildService();

    await service.ingestObservationClassify(basePayload as any);

    expect(batteryV2.onSnapshot).toHaveBeenCalled();
  });
});
