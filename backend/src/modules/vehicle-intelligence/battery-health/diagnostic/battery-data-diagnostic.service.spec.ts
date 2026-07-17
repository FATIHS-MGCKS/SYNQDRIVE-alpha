import { BatteryDataDiagnosticService } from './battery-data-diagnostic.service';
import {
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  SohPublicationState,
} from '@prisma/client';

describe('BatteryDataDiagnosticService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';

  const prisma = {
    organization: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    batteryMeasurement: { findMany: jest.fn(), count: jest.fn() },
    batteryMeasurementSession: { findMany: jest.fn(), findUnique: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    batteryFeatures: { findMany: jest.fn() },
    batteryEvidence: { findMany: jest.fn() },
    batteryPublication: { findMany: jest.fn() },
    batteryAssessment: { findMany: jest.fn() },
    hvCapacityObservation: { findMany: jest.fn(), count: jest.fn() },
    vehicleBatteryReferenceCapacity: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  let service: BatteryDataDiagnosticService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatteryDataDiagnosticService(prisma as any);
    prisma.organization.findMany.mockResolvedValue([{ id: organizationId }]);
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: vehicleId,
        organizationId,
        fuelType: 'ICE',
        hvBatteryCapacityKwh: null,
        batteryMeasurementSessions: [],
        latestState: null,
      },
    ]);
    prisma.batteryMeasurement.findMany.mockResolvedValue([]);
    prisma.batteryMeasurement.count.mockResolvedValue(0);
    prisma.batteryMeasurementSession.findMany.mockResolvedValue([]);
    prisma.batteryMeasurementSession.findUnique.mockResolvedValue(null);
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    prisma.batteryFeatures.findMany.mockResolvedValue([]);
    prisma.batteryEvidence.findMany.mockResolvedValue([]);
    prisma.batteryPublication.findMany.mockResolvedValue([]);
    prisma.batteryAssessment.findMany.mockResolvedValue([]);
    prisma.hvCapacityObservation.findMany.mockResolvedValue([]);
    prisma.hvCapacityObservation.count.mockResolvedValue(0);
    prisma.vehicleBatteryReferenceCapacity.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it('flags REST voltage above wake threshold when quality is valid', async () => {
    prisma.batteryMeasurement.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.numericValue?.gte != null) {
        return [
          {
            id: 'm-1',
            vehicleId,
            type: BatteryMeasurementType.REST_60M,
            numericValue: 14.1,
            quality: BatteryMeasurementQuality.VALID,
            observedAt: new Date('2026-07-01T10:00:00Z'),
          },
        ];
      }
      return [];
    });

    const report = await service.runDiagnostic({ organizationId, includeFindings: true });
    expect(report.summary.byCheck.rest_voltage_above_wake_threshold).toBe(1);
    expect(report.findings?.[0]?.checkId).toBe('rest_voltage_above_wake_threshold');
  });

  it('flags REST_60M and REST_6H with identical observedAt', async () => {
    const observedAt = new Date('2026-07-01T12:00:00Z');
    prisma.batteryMeasurement.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.type?.in) {
        return [
          {
            id: 'm-60',
            vehicleId,
            type: BatteryMeasurementType.REST_60M,
            observedAt,
          },
          {
            id: 'm-6h',
            vehicleId,
            type: BatteryMeasurementType.REST_6H,
            observedAt,
          },
        ];
      }
      return [];
    });

    const report = await service.runDiagnostic({ organizationId });
    expect(report.summary.byCheck.rest_60m_6h_same_timestamp).toBe(1);
  });

  it('flags LV SOH_PERCENT evidence', async () => {
    prisma.batteryEvidence.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        vehicleId,
        sourceType: 'TELEMETRY_DERIVED',
        numericValue: 85,
        observedAt: new Date(),
      },
    ]);

    const report = await service.runDiagnostic({ organizationId });
    expect(report.summary.byCheck.lv_wrong_soh_percent_evidence).toBe(1);
  });

  it('flags STABLE publication without belastbare evidence', async () => {
    prisma.batteryPublication.findMany.mockResolvedValue([
      {
        id: 'pub-1',
        vehicleId,
        scope: 'LV',
        status: SohPublicationState.STABLE,
        assessmentId: 'assess-1',
        assessment: {
          id: 'assess-1',
          evidenceStrength: 'LOW',
          maturity: 'LOW',
          inputSummary: { selectedMeasurementIds: [], evidenceCycles: [] },
        },
      },
    ]);
    prisma.batteryMeasurement.count.mockResolvedValue(0);

    const report = await service.runDiagnostic({ organizationId });
    expect(report.summary.byCheck.stable_publication_without_evidence).toBe(1);
  });

  it('is read-only in report contract', async () => {
    const report = await service.runDiagnostic({ organizationId });
    expect(report.readOnly).toBe(true);
    expect(report.dryRun).toBe(true);
    expect(report.scriptVersion).toBe('1.0.0');
  });
});
