import { BatteryDataRepairService } from './battery-data-repair.service';
import { BatteryDataDiagnosticService } from './battery-data-diagnostic.service';
import {
  BatteryEvidenceScope,
  BatteryEvidenceValueType,
  ReferenceCapacityVerificationStatus,
  SohPublicationState,
} from '@prisma/client';

describe('BatteryDataRepairService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const evidenceId = 'ev-1';
  const measurementId = 'meas-1';
  const publicationId = 'pub-1';
  const featuresId = 'feat-1';
  const referenceId = 'ref-1';

  const diagnostic = {
    runDiagnostic: jest.fn(),
  };

  const prisma = {
    organization: { findMany: jest.fn() },
    vehicle: { count: jest.fn() },
    batteryEvidence: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    batteryMeasurement: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    batteryPublication: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    batteryFeatures: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    hvBatteryHealthSnapshot: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    vehicleBatteryReferenceCapacity: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    vehicleBatteryReferenceCapacityChange: { create: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };

  let service: BatteryDataRepairService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatteryDataRepairService(prisma as any, diagnostic as any);
    prisma.organization.findMany.mockResolvedValue([{ id: organizationId }]);
    prisma.vehicle.count.mockResolvedValue(1);
    prisma.batteryMeasurement.count.mockResolvedValue(0);
    prisma.batteryFeatures.findMany.mockResolvedValue([]);
    diagnostic.runDiagnostic.mockResolvedValue({
      mode: 'diagnostic',
      findings: [],
      summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
      checks: [],
    });
  });

  it('defaults to dry-run without writes', async () => {
    diagnostic.runDiagnostic.mockResolvedValueOnce({
      mode: 'diagnostic',
      findings: [
        {
          checkId: 'lv_wrong_soh_percent_evidence',
          organizationId,
          vehicleId,
          details: { evidenceId },
        },
      ],
      summary: { totalFindings: 1, errors: 1, warnings: 0, infos: 0 },
      checks: [],
    });

    prisma.batteryEvidence.findFirst.mockResolvedValue({
      id: evidenceId,
      valueType: BatteryEvidenceValueType.SOH_PERCENT,
      scope: BatteryEvidenceScope.LV,
      quality: null,
      metadataJson: null,
    });

    const report = await service.runRepair({ organizationId, apply: false });

    expect(report.dryRun).toBe(true);
    expect(report.summary.planned).toBe(1);
    expect(report.summary.applied).toBe(0);
    expect(prisma.batteryEvidence.update).not.toHaveBeenCalled();
  });

  it('reclassifies LV SOH_PERCENT evidence on --apply', async () => {
    diagnostic.runDiagnostic
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        findings: [
          {
            checkId: 'lv_wrong_soh_percent_evidence',
            organizationId,
            vehicleId,
            details: { evidenceId },
          },
        ],
        summary: { totalFindings: 1, errors: 1, warnings: 0, infos: 0 },
        checks: [],
      })
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
        checks: [],
      });

    prisma.batteryEvidence.findFirst.mockResolvedValue({
      id: evidenceId,
      valueType: BatteryEvidenceValueType.SOH_PERCENT,
      scope: BatteryEvidenceScope.LV,
      quality: null,
      metadataJson: {},
    });
    prisma.batteryEvidence.findUniqueOrThrow.mockResolvedValue({
      id: evidenceId,
      metadataJson: {},
    });
    prisma.batteryEvidence.update.mockResolvedValue({});

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.applied).toBe(1);
    expect(prisma.batteryEvidence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: evidenceId },
        data: expect.objectContaining({
          quality: 'SUPERSEDED',
        }),
      }),
    );
  });

  it('marks REST measurement context as UNVERIFIED on apply', async () => {
    diagnostic.runDiagnostic
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        findings: [
          {
            checkId: 'rest_voltage_above_wake_threshold',
            organizationId,
            vehicleId,
            details: { measurementId },
          },
        ],
        summary: { totalFindings: 1, errors: 0, warnings: 1, infos: 0 },
        checks: [],
      })
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
        checks: [],
      });

    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      id: measurementId,
      type: 'REST_60M',
      quality: 'VALID',
      context: {},
    });
    prisma.batteryMeasurement.findUniqueOrThrow.mockResolvedValue({
      id: measurementId,
      context: {},
    });
    prisma.batteryMeasurement.update.mockResolvedValue({});

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.applied).toBe(1);
    expect(prisma.batteryMeasurement.update).toHaveBeenCalled();
  });

  it('resets unsafe STABLE publication', async () => {
    diagnostic.runDiagnostic
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        findings: [
          {
            checkId: 'stable_publication_without_evidence',
            organizationId,
            vehicleId,
            details: { publicationId },
          },
        ],
        summary: { totalFindings: 1, errors: 1, warnings: 0, infos: 0 },
        checks: [],
      })
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
        checks: [],
      });

    prisma.batteryPublication.findFirst.mockResolvedValue({
      id: publicationId,
      status: SohPublicationState.STABLE,
      reason: JSON.stringify({ maturity: 'STABLE' }),
    });
    prisma.batteryPublication.findUniqueOrThrow.mockResolvedValue({
      id: publicationId,
      reason: JSON.stringify({ maturity: 'STABLE' }),
    });
    prisma.batteryPublication.update.mockResolvedValue({});
    prisma.batteryFeatures.updateMany.mockResolvedValue({ count: 1 });

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.applied).toBe(1);
    expect(prisma.batteryPublication.update).toHaveBeenCalled();
    expect(prisma.batteryFeatures.updateMany).toHaveBeenCalled();
  });

  it('dedupes identical HV snapshots on apply', async () => {
    const canonical = {
      id: 'snap-1',
      socPercent: 50,
      energyUsedKwh: 30,
      estimatedCapacityKwh: null,
      sohPercent: null,
      providerSohPercent: null,
      idempotencyKey: 'hv:1',
      recordedAt: new Date('2026-07-01T10:00:00Z'),
      createdAt: new Date('2026-07-01T10:00:01Z'),
    };
    const duplicate = { ...canonical, id: 'snap-2', createdAt: new Date('2026-07-01T10:00:02Z') };

    diagnostic.runDiagnostic
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        findings: [
          {
            checkId: 'hv_persistence_duplicate',
            organizationId,
            vehicleId,
            details: { idempotencyKey: 'hv:1', count: 2 },
          },
        ],
        summary: { totalFindings: 1, errors: 0, warnings: 1, infos: 0 },
        checks: [],
      })
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
        checks: [],
      });

    prisma.hvBatteryHealthSnapshot.findMany.mockResolvedValue([canonical, duplicate]);
    prisma.hvBatteryHealthSnapshot.delete.mockResolvedValue({});

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.applied).toBe(1);
    expect(prisma.hvBatteryHealthSnapshot.delete).toHaveBeenCalledWith({
      where: { id: 'snap-2' },
    });
  });

  it('marks reference capacity UNVERIFIED with audit trail', async () => {
    diagnostic.runDiagnostic
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        findings: [
          {
            checkId: 'unverified_reference_capacity',
            organizationId,
            vehicleId,
            details: { referenceCapacityId: referenceId },
          },
        ],
        summary: { totalFindings: 1, errors: 0, warnings: 1, infos: 0 },
        checks: [],
      })
      .mockResolvedValueOnce({
        mode: 'diagnostic',
        summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0 },
        checks: [],
      });

    prisma.vehicleBatteryReferenceCapacity.findFirst.mockResolvedValue({
      id: referenceId,
      isActive: true,
      verificationStatus: ReferenceCapacityVerificationStatus.PENDING_REVIEW,
    });
    prisma.vehicleBatteryReferenceCapacity.findUniqueOrThrow.mockResolvedValue({
      id: referenceId,
      verificationStatus: ReferenceCapacityVerificationStatus.PENDING_REVIEW,
    });
    prisma.vehicleBatteryReferenceCapacity.update.mockResolvedValue({});
    prisma.vehicleBatteryReferenceCapacityChange.create.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.applied).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('skips idempotent LV evidence reclassification', async () => {
    diagnostic.runDiagnostic.mockResolvedValueOnce({
      mode: 'diagnostic',
      findings: [
        {
          checkId: 'lv_wrong_soh_percent_evidence',
          organizationId,
          vehicleId,
          details: { evidenceId },
        },
      ],
      summary: { totalFindings: 1, errors: 1, warnings: 0, infos: 0 },
      checks: [],
    });

    prisma.batteryEvidence.findFirst.mockResolvedValue({
      id: evidenceId,
      metadataJson: {
        batteryDataRepair: {
          actionId: 'reclassify_lv_soh_percent_evidence',
          appliedAt: '2026-01-01T00:00:00Z',
        },
      },
    });

    const report = await service.runRepair({ organizationId, apply: true });

    expect(report.summary.planned).toBe(0);
    expect(report.summary.skipped).toBe(1);
  });
});
