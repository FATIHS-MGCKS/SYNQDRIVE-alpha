import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
  PrismaClient,
} from '@prisma/client';
import batteryV2RetentionConfig from '@config/battery-v2-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryV2RetentionAggregateService } from './battery-v2-retention-aggregate.service';
import { BatteryV2RetentionService } from './battery-v2-retention.service';

const LIVE = process.env.BATTERY_V2_RETENTION_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)('Battery V2 retention integration (DATABASE_URL)', () => {
  let prisma: PrismaClient;
  let service: BatteryV2RetentionService;
  let dbOk = false;
  let organizationId = '';
  let vehicleId = '';
  let sessionId = '';
  let measurementId = '';
  let evidenceId = '';

  beforeAll(async () => {
    process.env.BATTERY_V2_RETENTION_ENABLED = 'true';
    process.env.BATTERY_V2_RETENTION_DRY_RUN = 'false';
    process.env.RETENTION_BATTERY_MEASUREMENTS_LV_DAYS = '30';
    process.env.RETENTION_BATTERY_EVIDENCE_SHADOW_DAYS = '30';

    dbOk = await probeDatabase();
    if (!dbOk) return;

    prisma = new PrismaClient();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [batteryV2RetentionConfig],
        }),
      ],
      providers: [
        BatteryV2RetentionAggregateService,
        BatteryV2RetentionService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(BatteryV2RetentionService);
  }, 60_000);

  beforeEach(async () => {
    if (!dbOk) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const org = await prisma.organization.create({
      data: {
        companyName: `Retention Test Org ${suffix}`,
        businessType: 'FLEET',
        status: 'ACTIVE',
      },
    });
    organizationId = org.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        licensePlate: `RT-${suffix}`,
        vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
        make: 'Test',
        model: 'Retention',
        year: 2024,
        fuelType: 'ELECTRIC',
        status: 'AVAILABLE',
      },
    });
    vehicleId = vehicle.id;

    const oldObservedAt = new Date('2019-06-01T00:00:00.000Z');
    const session = await prisma.batteryMeasurementSession.create({
      data: {
        organizationId,
        vehicleId,
        scope: BatteryEvidenceScope.LV,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: BatteryMeasurementSessionStatus.COMPLETED,
        startedAt: oldObservedAt,
        endedAt: oldObservedAt,
        idempotencyKey: `session-${suffix}`,
      },
    });
    sessionId = session.id;

    const measurement = await prisma.batteryMeasurement.create({
      data: {
        organizationId,
        vehicleId,
        sessionId,
        scope: BatteryEvidenceScope.LV,
        type: BatteryMeasurementType.REST_60M,
        quality: BatteryMeasurementQuality.SHADOW,
        observedAt: oldObservedAt,
        idempotencyKey: `measurement-${suffix}`,
        numericValue: 12.4,
        unit: 'V',
      },
    });
    measurementId = measurement.id;

    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.RESTING_VOLTAGE_V,
        numericValue: 12.4,
        observedAt: oldObservedAt,
        measurementId,
      },
    });
    evidenceId = evidence.id;
  }, 30_000);

  afterEach(async () => {
    if (!dbOk) return;
    await prisma.batteryRetentionAggregate.deleteMany({ where: { vehicleId } });
    await prisma.batteryEvidence.deleteMany({ where: { vehicleId } });
    await prisma.batteryMeasurement.deleteMany({ where: { vehicleId } });
    await prisma.batteryMeasurementSession.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }, 30_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('connects to PostgreSQL', () => {
    expect(dbOk).toBe(true);
  });

  it('does not delete measurements referenced by qualified evidence', async () => {
    const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
    expect(report.totals.deleted).toBeGreaterThanOrEqual(0);

    const remaining = await prisma.batteryMeasurement.findUnique({
      where: { id: measurementId },
    });
    expect(remaining).not.toBeNull();
  });

  it('creates aggregates then deletes unreferenced shadow measurements', async () => {
    await prisma.batteryEvidence.delete({ where: { id: evidenceId } });

    const dryReport = await service.runOnce({ trigger: 'manual', dryRunOverride: true });
    expect(dryReport.totals.aggregated).toBeGreaterThan(0);

    const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
    expect(report.totals.aggregated).toBeGreaterThan(0);

    const aggregateCount = await prisma.batteryRetentionAggregate.count({
      where: { vehicleId },
    });
    expect(aggregateCount).toBeGreaterThan(0);

    const remaining = await prisma.batteryMeasurement.findUnique({
      where: { id: measurementId },
    });
    expect(remaining).toBeNull();
  }, 60_000);
});
