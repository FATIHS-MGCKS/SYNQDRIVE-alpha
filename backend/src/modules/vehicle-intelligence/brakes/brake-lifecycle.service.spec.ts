import { BrakeLifecycleService } from './brake-lifecycle.service';

const mockPrisma = {
  vehicle: {
    findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
  },
  vehicleLatestState: {
    findUnique: jest.fn().mockResolvedValue({ odometerKm: 52000 }),
  },
  vehicleBrakeReferenceSpec: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  brakeHealthCurrent: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  vehicleServiceEvent: {
    create: jest.fn(),
    update: jest.fn(),
  },
} as any;

const mockBrakeHealth = {
  initializeFromService: jest.fn().mockResolvedValue({ initialized: true, message: 'ok' }),
  applyScopedComponentAnchors: jest.fn().mockResolvedValue({ updated: true, recalculated: true }),
} as any;

const mockBrakeEvidence = {
  recordMany: jest.fn().mockResolvedValue({ count: 1 }),
} as any;

const svc = new BrakeLifecycleService(mockPrisma, mockBrakeHealth, mockBrakeEvidence);

describe('BrakeLifecycleService.recordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.vehicleServiceEvent.create.mockResolvedValue({ id: 'evt-1' });
    mockPrisma.vehicleServiceEvent.update.mockResolvedValue({});
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValue(null);
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([]);
  });

  it('writes WORKSHOP_REPORT BrakeEvidence after manual service with measurements', async () => {
    await svc.recordService({
      vehicleId: 'v1',
      serviceDate: '2026-06-01T10:00:00Z',
      odometerKm: 52000,
      source: 'manual',
      kind: 'pads_service',
      measured: { frontPadMm: 8.5, rearPadMm: 7.2 },
    });

    expect(mockBrakeEvidence.recordMany).toHaveBeenCalledTimes(1);
    const rows = mockBrakeEvidence.recordMany.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('WORKSHOP_REPORT');
    expect(rows[0].measuredPadMm).toBe(8.5);
    expect(rows[1].measuredPadMm).toBe(7.2);
  });

  it('does not duplicate evidence for ai_document (handled by document extraction)', async () => {
    await svc.recordService({
      vehicleId: 'v1',
      serviceDate: '2026-06-01T10:00:00Z',
      source: 'ai_document',
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 8.5 },
    });

    expect(mockBrakeEvidence.recordMany).not.toHaveBeenCalled();
  });

  it('rejects full_brake_service without explicit scope', async () => {
    await expect(
      svc.recordService({
        vehicleId: 'v1',
        serviceDate: '2026-06-01T10:00:00Z',
        kind: 'full_brake_service',
      }),
    ).rejects.toThrow('full_service_requires_explicit_scope');
  });

  it('initializeFromRegistration uses manual_registration and spec fallback for NEW', async () => {
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([
      {
        frontPadThickness: 10,
        rearPadThickness: 10,
        frontRotorWidth: 28,
        rearRotorWidth: 26,
      },
    ]);

    const result = await svc.initializeFromRegistration({
      vehicleId: 'v1',
      brakes: { condition: 'NEW' },
      registrationMileageKm: null,
      latestStateOdometerKm: null,
    });

    expect(result?.initialized).toBe(true);
    expect(mockPrisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brakeServiceSource: 'API',
          brakeServiceKind: 'FULL_BRAKE_SERVICE',
        }),
      }),
    );
    expect(mockBrakeHealth.initializeFromService).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ odometerKm: 0 }),
      expect.objectContaining({
        scopedComponents: expect.arrayContaining(['FRONT_PADS', 'REAR_PADS']),
      }),
    );
    expect(mockBrakeEvidence.recordMany).not.toHaveBeenCalled();
  });

  it('initializeFromRegistration writes evidence for user-submitted measurements', async () => {
    await svc.initializeFromRegistration({
      vehicleId: 'v1',
      brakes: {
        condition: 'NEW',
        frontPadThickness: 10.5,
        rearPadThickness: 10.2,
        odometerKm: 12,
      },
    });

    expect(mockBrakeEvidence.recordMany).toHaveBeenCalledTimes(1);
    expect(mockBrakeHealth.initializeFromService).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        odometerKm: 12,
        frontPadMm: 10.5,
        rearPadMm: 10.2,
      }),
      expect.any(Object),
    );
  });
});
