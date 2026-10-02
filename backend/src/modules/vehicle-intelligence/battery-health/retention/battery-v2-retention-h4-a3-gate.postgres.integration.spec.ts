import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BatteryMeasurementQuality, PrismaClient } from '@prisma/client';
import batteryV2RetentionConfig from '@config/battery-v2-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from '../hv-h4/m3-3-hv-h4.constants';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from '../hv-h4/m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { runM3_3HvH4DurableModeAA2ReportBundleV1 } from '../hv-h4/m3-3-hv-h4-a3-parity.harness.v1';
import { BatteryV2RetentionAggregateService } from './battery-v2-retention-aggregate.service';
import { BatteryV2RetentionService } from './battery-v2-retention.service';

const LIVE = process.env.BATTERY_V2_RETENTION_INTEGRATION === '1';
const OLD_START = new Date('2019-06-01T08:00:00.000Z');
const OLD_END = new Date('2019-06-01T10:00:00.000Z');
const EVAL = new Date('2026-09-01T00:00:00.000Z');

function applyHvChargeSessionsOnlyRetentionEnv(overrides: {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
} = {}) {
  process.env.BATTERY_V2_RETENTION_ENABLED = 'true';
  process.env.BATTERY_V2_RETENTION_DRY_RUN =
    overrides.dryRun === true ? 'true' : overrides.dryRun === false ? 'false' : 'false';
  if (overrides.batchSize != null) {
    process.env.BATTERY_V2_RETENTION_BATCH_SIZE = String(overrides.batchSize);
  }
  if (overrides.maxBatches != null) {
    process.env.BATTERY_V2_RETENTION_MAX_BATCHES = String(overrides.maxBatches);
  }
  process.env.RETENTION_HV_CHARGE_SESSIONS_DAYS = '365';
  process.env.RETENTION_BATTERY_LV_PROVIDER_SNAPSHOTS_DAYS = '0';
  process.env.RETENTION_HV_PROVIDER_SNAPSHOTS_DAYS = '0';
  process.env.RETENTION_BATTERY_MEASUREMENTS_LV_DAYS = '0';
  process.env.RETENTION_BATTERY_MEASUREMENTS_HV_DAYS = '0';
  process.env.RETENTION_BATTERY_MEASUREMENT_SESSIONS_DAYS = '0';
  process.env.RETENTION_BATTERY_ASSESSMENTS_DAYS = '0';
  process.env.RETENTION_HV_CAPACITY_OBSERVATIONS_DAYS = '0';
  process.env.RETENTION_BATTERY_EVIDENCE_SHADOW_DAYS = '0';
  process.env.RETENTION_BATTERY_CAPABILITY_CHANGES_DAYS = '0';
  process.env.RETENTION_BATTERY_V2_DEAD_LETTERS_DAYS = '0';
}

async function createEligibleSession(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  overrides: {
    id?: string;
    startAt?: Date;
    segmentFingerprint?: string;
    energyAddedKwh?: number;
  } = {},
) {
  return prisma.hvChargeSession.create({
    data: {
      id: overrides.id ?? randomUUID(),
      organizationId,
      vehicleId,
      segmentFingerprint: overrides.segmentFingerprint ?? `fp-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: overrides.startAt ?? OLD_START,
      endAt: OLD_END,
      energyAddedKwh: overrides.energyAddedKwh ?? 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: OLD_END,
      receivedAt: OLD_END,
      updatedAt: OLD_END,
      providerObservedAt: OLD_END,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    },
  });
}

(LIVE ? describe : describe.skip)(
  'Battery V2 retention service — M3.3-HV-H4-A3.4 gate path (postgres)',
  () => {
    let prisma: PrismaClient;
    let service: BatteryV2RetentionService;
    let writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function buildService() {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [batteryV2RetentionConfig],
            ignoreEnvFile: true,
          }),
        ],
        providers: [
          BatteryV2RetentionAggregateService,
          BatteryV2RetentionService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      return moduleRef.get(BatteryV2RetentionService);
    }

    function hvPhase(report: Awaited<ReturnType<BatteryV2RetentionService['runOnce']>>) {
      const phase = report.phases.find((p) => p.phase === 'prune_hv_charge_sessions');
      if (!phase) throw new Error('missing prune_hv_charge_sessions phase');
      return phase;
    }

    it('S1) service exact ACK delete', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({ dryRun: false });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await writer.persistFromHvChargeSession(session);

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
      const phase = hvPhase(report);
      expect(phase.dryRun).toBe(false);
      expect(phase.deleted).toBe(1);
      expect(phase.skipped).toBe(0);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(0);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { id: persisted.revision.id },
        }),
      ).toBe(1);
      expect(
        await prisma.batteryHvChargeSessionEvidenceAck.count({
          where: { revisionId: persisted.revision.id },
        }),
      ).toBe(1);
    });

    it('S2) service missing ACK block — no writer side effect', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({ dryRun: false });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const revisionsBefore = await prisma.batteryHvChargeSessionEvidenceRevision.count();

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
      const phase = hvPhase(report);
      expect(phase.deleted).toBe(0);
      expect(phase.skipped).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);
      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count()).toBe(revisionsBefore);
      const bundle = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
    });

    it('S3) service stale ACK block after live mutation', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({ dryRun: false });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await writer.persistFromHvChargeSession(session);
      await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 21, updatedAt: new Date('2020-01-01T00:00:00.000Z') },
      });

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
      const phase = hvPhase(report);
      expect(phase.deleted).toBe(0);
      expect(phase.skipped).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);
    });

    it('S4) service capacity observation reference block', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({ dryRun: false });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await writer.persistFromHvChargeSession(session);
      await prisma.hvCapacityObservation.create({
        data: {
          organizationId,
          vehicleId,
          chargeSessionId: session.id,
          method: HV_M2_CAPACITY_METHOD,
          observedAt: OLD_END,
          idempotencyKey: `cap-${randomUUID()}`,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
        },
      });

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
      const phase = hvPhase(report);
      expect(phase.deleted).toBe(0);
      expect(phase.skipped).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);
    });

    it('S5) service dry-run — would delete accounting, no physical delete', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({ dryRun: true });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await writer.persistFromHvChargeSession(session);
      const ackBefore = await prisma.batteryHvChargeSessionEvidenceAck.findFirstOrThrow({
        where: { revisionId: persisted.revision.id },
      });

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: true });
      const phase = hvPhase(report);
      expect(phase.dryRun).toBe(true);
      expect(phase.deleted).toBe(1);
      expect(phase.skipped).toBe(0);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);
      const ackAfter = await prisma.batteryHvChargeSessionEvidenceAck.findFirstOrThrow({
        where: { id: ackBefore.id },
      });
      expect(ackAfter.acknowledgedAt.toISOString()).toBe(ackBefore.acknowledgedAt.toISOString());
    });

    it('batch progress — blocked front page does not starve later eligible row (same startAt, id keyset)', async () => {
      applyHvChargeSessionsOnlyRetentionEnv({
        dryRun: false,
        batchSize: 2,
        maxBatches: 5,
      });
      service = await buildService();
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const sharedStart = new Date('2018-01-01T08:00:00.000Z');

      const idA = '10000000-0000-4000-8000-000000000001';
      const idB = '10000000-0000-4000-8000-000000000002';
      const idC = '10000000-0000-4000-8000-000000000003';

      await createEligibleSession(prisma, organizationId, vehicleId, {
        id: idA,
        startAt: sharedStart,
      });
      await createEligibleSession(prisma, organizationId, vehicleId, {
        id: idB,
        startAt: sharedStart,
      });
      const sessionC = await createEligibleSession(prisma, organizationId, vehicleId, {
        id: idC,
        startAt: sharedStart,
      });
      await writer.persistFromHvChargeSession(sessionC);

      const report = await service.runOnce({ trigger: 'manual', dryRunOverride: false });
      const phase = hvPhase(report);

      expect(await prisma.hvChargeSession.count({ where: { id: idA } })).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: idB } })).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: idC } })).toBe(0);
      expect(phase.deleted).toBe(1);
      expect(phase.skipped).toBe(2);
      expect(phase.scanned).toBe(3);
    });
  },
);
