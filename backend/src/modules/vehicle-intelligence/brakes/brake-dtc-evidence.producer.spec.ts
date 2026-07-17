import { BrakeDtcEvidenceProducerService } from './brake-dtc-evidence.producer';

const VEHICLE_ID = 'veh-1';
const ORG_ID = 'org-1';

const absEvent = {
  id: 'dtc-event-1',
  vehicleId: VEHICLE_ID,
  dtcCode: 'C0035',
  description: null,
  severity: 'WARNING' as const,
  isActive: true,
  firstSeenAt: new Date('2026-07-01T10:00:00Z'),
  lastSeenAt: new Date('2026-07-17T10:00:00Z'),
  clearedAt: null,
  occurrenceCount: 2,
  rawPayload: null,
  createdAt: new Date('2026-07-01T10:00:00Z'),
};

describe('BrakeDtcEvidenceProducerService', () => {
  const prisma = {
    vehicle: { findUnique: jest.fn() },
    vehicleLatestState: { findUnique: jest.fn() },
    brakeEvidence: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicleDtcEvent: { findMany: jest.fn() },
  };
  const brakeEvidence = { record: jest.fn() };
  const recalcOrchestrator = { enqueue: jest.fn().mockResolvedValue({ queued: true }) };
  const notificationIngest = { ingestVehicleHealthSources: jest.fn().mockResolvedValue(undefined) };

  const service = new BrakeDtcEvidenceProducerService(
    prisma as never,
    brakeEvidence as never,
    recalcOrchestrator as never,
    notificationIngest as never,
  );

  const context = {
    sourceProvider: 'DIMO' as const,
    sourceTimestamp: new Date('2026-07-17T10:00:00Z'),
    organizationId: ORG_ID,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: ORG_ID,
      licensePlate: 'B-AB 123',
      make: 'VW',
      model: 'Golf',
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastDtcSuccessfulCheckAt: new Date(),
    });
    prisma.brakeEvidence.findFirst.mockResolvedValue(null);
    prisma.brakeEvidence.create.mockResolvedValue({ id: 'ev-1' });
    prisma.brakeEvidence.update.mockResolvedValue({ id: 'ev-1' });
  });

  it('creates structured brake evidence for ABS DTCs', async () => {
    const result = await service.onDtcUpserted(VEHICLE_ID, absEvent, context);

    expect(result).toBe('created');
    expect(prisma.brakeEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: VEHICLE_ID,
          source: 'DTC_SIGNAL',
          dtcCode: 'C0035',
          dtcCategory: 'ABS',
          dtcSeverity: 'WARNING',
          dtcActive: true,
          vehicleDtcEventId: 'dtc-event-1',
          dedupeKey: 'dtc:C0035',
          sourceProvider: 'DIMO',
        }),
      }),
    );
    expect(recalcOrchestrator.enqueue).toHaveBeenCalledWith({
      vehicleId: VEHICLE_ID,
      trigger: 'dtc',
    });
  });

  it('creates ESC evidence with structured severity', async () => {
    await service.onDtcUpserted(
      VEHICLE_ID,
      { ...absEvent, id: 'dtc-esc', dtcCode: 'C0455' },
      context,
    );

    expect(prisma.brakeEvidence.create.mock.calls[0][0].data.dtcCategory).toBe('ESC');
  });

  it('skips non-relevant powertrain DTCs like glow plug faults', async () => {
    const result = await service.onDtcUpserted(
      VEHICLE_ID,
      { ...absEvent, id: 'dtc-pt', dtcCode: 'P0675' },
      context,
    );

    expect(result).toBe('skipped');
    expect(prisma.brakeEvidence.create).not.toHaveBeenCalled();
  });

  it('deduplicates provider duplicates via dedupeKey update', async () => {
    prisma.brakeEvidence.findFirst.mockResolvedValueOnce({
      id: 'ev-existing',
      dtcActive: true,
    });

    const result = await service.onDtcUpserted(VEHICLE_ID, absEvent, context);

    expect(result).toBe('updated');
    expect(prisma.brakeEvidence.update).toHaveBeenCalled();
    expect(prisma.brakeEvidence.create).not.toHaveBeenCalled();
  });

  it('reactivates cleared evidence when a DTC returns', async () => {
    prisma.brakeEvidence.findFirst.mockResolvedValueOnce({
      id: 'ev-cleared',
      dtcActive: false,
    });

    const result = await service.onDtcUpserted(VEHICLE_ID, absEvent, context);

    expect(result).toBe('updated');
    expect(prisma.brakeEvidence.update.mock.calls[0][0].data.dtcActive).toBe(true);
    expect(prisma.brakeEvidence.update.mock.calls[0][0].data.dtcResolvedAt).toBeNull();
  });

  it('closes active evidence on DTC clearance while preserving the row', async () => {
    prisma.brakeEvidence.findFirst.mockResolvedValueOnce({
      id: 'ev-active',
      dtcActive: true,
    });

    const result = await service.onDtcCleared(
      VEHICLE_ID,
      'C0035',
      new Date('2026-07-18T10:00:00Z'),
      context,
    );

    expect(result).toBe('cleared');
    expect(prisma.brakeEvidence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev-active' },
        data: expect.objectContaining({
          dtcActive: false,
          dtcResolvedAt: expect.any(Date),
        }),
      }),
    );
    expect(notificationIngest.ingestVehicleHealthSources).toHaveBeenCalledWith(
      ORG_ID,
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'BRAKE_CRITICAL',
          cleared: true,
        }),
      ]),
    );
  });

  it('stores review-required unknown chassis codes as WARNING only', async () => {
    await service.onDtcUpserted(
      VEHICLE_ID,
      { ...absEvent, id: 'dtc-unknown', dtcCode: 'C1999' },
      context,
    );

    const payload = prisma.brakeEvidence.create.mock.calls[0][0].data;
    expect(payload.dtcReviewRequired).toBe(true);
    expect(payload.dtcSeverity).toBe('WARNING');
    expect(notificationIngest.ingestVehicleHealthSources).not.toHaveBeenCalled();
  });

  it('marks stale monitoring evidence when last successful poll is old', async () => {
    prisma.vehicleLatestState.findUnique.mockResolvedValueOnce({
      lastDtcSuccessfulCheckAt: new Date(Date.now() - 8 * 60 * 60_000),
    });

    await service.onDtcUpserted(VEHICLE_ID, absEvent, context);

    expect(prisma.brakeEvidence.create.mock.calls[0][0].data.dtcFreshness).toBe('STALE');
  });

  it('rejects cross-tenant producer calls', async () => {
    prisma.vehicle.findUnique.mockResolvedValueOnce({ organizationId: 'other-org' });

    const result = await service.onDtcUpserted(VEHICLE_ID, absEvent, context);

    expect(result).toBe('skipped');
    expect(prisma.brakeEvidence.create).not.toHaveBeenCalled();
  });
});
