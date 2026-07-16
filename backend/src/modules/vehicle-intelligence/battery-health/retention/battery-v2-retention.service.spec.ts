import { ConfigService } from '@nestjs/config';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryV2RetentionAggregateService } from './battery-v2-retention-aggregate.service';
import { BatteryV2RetentionService } from './battery-v2-retention.service';

describe('BatteryV2RetentionService', () => {
  const prisma = {
    batteryMeasurement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryEvidence: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    hvCapacityObservation: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryAssessment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryPublication: {
      count: jest.fn(),
    },
    hvChargeSession: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryMeasurementSession: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryHealthSnapshot: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    hvBatteryHealthSnapshot: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    vehicleBatteryCapabilityChange: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    batteryV2JobDeadLetter: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const aggregates = {
    ensureSessionAggregates: jest.fn(),
    ensureDailyAggregatesForMeasurements: jest.fn(),
    sessionHasAggregate: jest.fn(),
    dailyHasAggregate: jest.fn(),
  } as unknown as BatteryV2RetentionAggregateService;

  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;

  let service: BatteryV2RetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (config.get as jest.Mock).mockImplementation((key: string, def?: unknown) => {
      const map: Record<string, unknown> = {
        'batteryV2Retention.enabled': true,
        'batteryV2Retention.dryRun': true,
        'batteryV2Retention.batchSize': 100,
        'batteryV2Retention.maxBatchesPerPhase': 5,
        'batteryV2Retention.days': {
          lvProviderSnapshots: 90,
          hvProviderSnapshots: 365,
          measurementsLv: 30,
          measurementsHv: 30,
          measurementSessions: 30,
          assessmentsDetail: 30,
          hvChargeSessions: 30,
          hvCapacityObservations: 30,
          evidenceShadowOnly: 30,
          capabilityChanges: 30,
          deadLetters: 30,
          publications: 0,
          qualifiedEvidence: 0,
          aggregates: 0,
        },
      };
      return map[key] ?? def;
    });
    service = new BatteryV2RetentionService(prisma, config, aggregates);
    (aggregates.ensureSessionAggregates as jest.Mock).mockResolvedValue({
      aggregated: 1,
      skipped: 0,
    });
    (aggregates.ensureDailyAggregatesForMeasurements as jest.Mock).mockResolvedValue({
      aggregated: 1,
      skipped: 0,
    });
    (aggregates.sessionHasAggregate as jest.Mock).mockResolvedValue(true);
    (aggregates.dailyHasAggregate as jest.Mock).mockResolvedValue(true);
    (prisma.batteryMeasurement.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.batteryEvidence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.hvCapacityObservation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.batteryAssessment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.hvChargeSession.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.batteryMeasurementSession.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.batteryHealthSnapshot.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.hvBatteryHealthSnapshot.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicleBatteryCapabilityChange.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.batteryV2JobDeadLetter.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns empty report when disabled', async () => {
    (config.get as jest.Mock).mockImplementation((key: string, def?: unknown) => {
      if (key === 'batteryV2Retention.enabled') return false;
      return def;
    });
    const report = await service.runOnce();
    expect(report.phases).toHaveLength(0);
  });

  it('skips measurement delete when referenced by qualified evidence', async () => {
    (prisma.batteryMeasurement.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where?: { scope?: BatteryEvidenceScope } }) => {
        if (where?.scope === BatteryEvidenceScope.HV) return [];
        return [
          {
            id: 'm1',
            vehicleId: 'v1',
            sessionId: 's1',
            scope: BatteryEvidenceScope.LV,
            observedAt: new Date('2020-01-01T00:00:00.000Z'),
            supersededById: null,
          },
        ];
      },
    );
    (prisma.batteryEvidence.findFirst as jest.Mock).mockResolvedValue({
      id: 'e1',
      sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
      documentExtractionId: null,
      serviceEventId: null,
    });
    (prisma.batteryMeasurement.count as jest.Mock).mockResolvedValue(0);

    const report = await service.runOnce({ dryRunOverride: true });
    const prunePhase = report.phases.find((phase) => phase.phase === 'prune_measurements');
    expect(prunePhase?.deleted).toBe(0);
    expect(prunePhase?.skipped).toBeGreaterThan(0);
    expect(prisma.batteryMeasurement.deleteMany).not.toHaveBeenCalled();
  });

  it('dry-run counts deletable measurements without deleteMany', async () => {
    (prisma.batteryMeasurement.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where?: { scope?: BatteryEvidenceScope } }) => {
        if (where?.scope === BatteryEvidenceScope.HV) return [];
        return [
          {
            id: 'm1',
            vehicleId: 'v1',
            sessionId: 's1',
            scope: BatteryEvidenceScope.LV,
            observedAt: new Date('2020-01-01T00:00:00.000Z'),
            supersededById: null,
          },
        ];
      },
    );
    (prisma.batteryEvidence.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.batteryMeasurement.count as jest.Mock).mockResolvedValue(0);

    const report = await service.runOnce({ dryRunOverride: true });
    const prunePhase = report.phases.find((phase) => phase.phase === 'prune_measurements');
    expect(prunePhase?.deleted).toBe(1);
    expect(prisma.batteryMeasurement.deleteMany).not.toHaveBeenCalled();
  });
});
