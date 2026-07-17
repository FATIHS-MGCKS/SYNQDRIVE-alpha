import { BrakeInitializationWorkflowService } from './brake-initialization-workflow.service';
import {
  BrakeRegistrationBackfillService,
  inferBackfillBrakeCondition,
  isRegistrationBrakeSpecSource,
} from './brake-registration-backfill.service';

const mockPrisma = {
  vehicleBrakeReferenceSpec: { findMany: jest.fn() },
  brakeEvidence: { findFirst: jest.fn() },
  brakeHealthAlert: { findFirst: jest.fn() },
  vehicleLatestState: { findUnique: jest.fn() },
} as any;

const mockWorkflow = {
  initializeFromRegistration: jest.fn(),
} as any;

const svc = new BrakeRegistrationBackfillService(mockPrisma, mockWorkflow);

describe('BrakeRegistrationBackfillService helpers', () => {
  it('treats manual_registration as explicit NEW condition', () => {
    expect(inferBackfillBrakeCondition({ sourceType: 'manual_registration' })).toBe('NEW');
  });

  it('does not infer NEW from MANUAL alone', () => {
    expect(inferBackfillBrakeCondition({ sourceType: 'MANUAL' })).toBe('UNKNOWN');
  });

  it('accepts MANUAL and manual_registration spec sources', () => {
    expect(isRegistrationBrakeSpecSource('MANUAL')).toBe(true);
    expect(isRegistrationBrakeSpecSource('manual_registration')).toBe(true);
    expect(isRegistrationBrakeSpecSource('AI_UPLOAD')).toBe(false);
  });
});

describe('BrakeRegistrationBackfillService.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.brakeEvidence.findFirst.mockResolvedValue(null);
    mockPrisma.brakeHealthAlert.findFirst.mockResolvedValue(null);
    mockPrisma.vehicleLatestState.findUnique.mockResolvedValue(null);
  });

  const baseSpec = {
    id: 'spec-1',
    vehicleId: 'veh-1',
    frontRotorDiameter: null,
    frontRotorWidth: null,
    frontPadThickness: 10,
    rearRotorDiameter: null,
    rearRotorWidth: null,
    rearPadThickness: 10,
    sourceType: 'manual_registration',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    vehicle: {
      id: 'veh-1',
      organizationId: 'org-1',
      licensePlate: 'B-XY 1',
      mileageKm: 1200,
      createdAt: new Date('2026-06-01T09:00:00.000Z'),
      latestState: { odometerKm: 1200 },
      brakeHealthCurrent: null,
    },
  };

  it('dry-run reports eligible vehicle as initialized without writes', async () => {
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([baseSpec]);

    const report = await svc.run({ dryRun: true });

    expect(report.mode).toBe('dry-run');
    expect(report.vehicles_scanned).toBe(1);
    expect(report.initialized).toBe(1);
    expect(mockWorkflow.initializeFromRegistration).not.toHaveBeenCalled();
  });

  it('execute initializes through BrakeInitializationWorkflowService', async () => {
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([baseSpec]);
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'initialized',
      initialized: true,
      skipped: false,
      message: 'ok',
    });

    const report = await svc.run({ dryRun: false });

    expect(report.initialized).toBe(1);
    expect(mockWorkflow.initializeFromRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        registrationMileageKm: 1200,
      }),
    );
  });

  it('skips when odometer anchor is missing for MANUAL spec without NEW', async () => {
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([
      {
        ...baseSpec,
        sourceType: 'MANUAL',
        vehicle: {
          ...baseSpec.vehicle,
          mileageKm: null,
          latestState: null,
        },
      },
    ]);

    const report = await svc.run({ dryRun: true });

    expect(report.skipped_missing_odometer).toBe(1);
    expect(report.initialized).toBe(0);
  });

  it('skips conflicting critical brake evidence', async () => {
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([baseSpec]);
    mockPrisma.brakeEvidence.findFirst.mockResolvedValue({ id: 'ev-1' });

    const report = await svc.run({ dryRun: true });

    expect(report.skipped_conflicting_alert).toBe(1);
  });
});

// helpers imported at top
