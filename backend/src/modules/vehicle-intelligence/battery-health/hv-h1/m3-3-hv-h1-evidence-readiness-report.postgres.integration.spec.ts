import { randomUUID } from 'crypto';
import {
  BatteryCapabilityStatus,
  BatteryMeasurementQuality,
  PrismaClient,
} from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  assertHvH1TransactionReadOnly,
  runM3_3HvH1EvidenceReadinessReport,
} from './m3-3-hv-h1-evidence-readiness-report.service';

const integrationEnabled = process.env.BATTERY_HV_H1_REPORT_INTEGRATION === '1';

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H1 evidence readiness report postgres',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('enforces transaction_read_only inside H1 read-only transaction', async () => {
      await prisma.$transaction(async (tx) => {
        await assertHvH1TransactionReadOnly(tx as never);
        const rows = await tx.$queryRaw<{ transaction_read_only: string }[]>`
          SHOW transaction_read_only
        `;
        expect(rows[0]?.transaction_read_only).toBe('on');
      });
    });

    it('scopes capability and session reads to organizationId + vehicleId (tenant isolation)', async () => {
      const orgA = await createGtOrgVehicle(prisma);
      const orgB = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2026-09-30T12:00:00.000Z');

      await prisma.vehicleBatteryCapability.create({
        data: {
          organizationId: orgA.organizationId,
          vehicleId: orgA.vehicleId,
          signalKey: 'hv.soc',
          status: BatteryCapabilityStatus.AVAILABLE,
          provider: 'DIMO',
          lastValue: 77,
          checkedAt: evaluationAt,
          sourceTimestamp: evaluationAt,
          lastSeenAt: evaluationAt,
        },
      });

      await prisma.hvChargeSession.create({
        data: {
          organizationId: orgA.organizationId,
          vehicleId: orgA.vehicleId,
          segmentFingerprint: `fp-${randomUUID()}`,
          source: 'DIMO_RECHARGE_SEGMENT',
          startAt: new Date('2026-09-29T10:00:00.000Z'),
          idempotencyKey: `idem-${randomUUID()}`,
          metadata: {
            qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
            capacityValidationEligible: true,
          },
        },
      });

      await prisma.hvCapacityObservation.create({
        data: {
          organizationId: orgA.organizationId,
          vehicleId: orgA.vehicleId,
          method: HV_M2_CAPACITY_METHOD,
          observedAt: new Date('2026-09-29T11:00:00.000Z'),
          idempotencyKey: `obs-${randomUUID()}`,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
          estimatedCapacityKwh: 60,
        },
      });

      const wrongOrgReport = await runM3_3HvH1EvidenceReadinessReport(prisma, {
        organizationId: orgB.organizationId,
        vehicleId: orgA.vehicleId,
        evaluationAt,
      });
      expect(wrongOrgReport.capabilityMatrix.rows).toHaveLength(0);
      expect(wrongOrgReport.sessionSummary.totalSessions).toBe(0);
      expect(wrongOrgReport.readiness.m2EvidenceReady.ready).toBe(false);

      const correctReport = await runM3_3HvH1EvidenceReadinessReport(prisma, {
        organizationId: orgA.organizationId,
        vehicleId: orgA.vehicleId,
        evaluationAt,
      });
      expect(correctReport.capabilityMatrix.rows.length).toBeGreaterThan(0);
      expect(correctReport.sessionSummary.totalSessions).toBe(1);
      expect(correctReport.readiness.m2EvidenceReady.ready).toBe(true);
      expect(correctReport.dbReadOnlyTransactionEnforced).toBe(true);
      expect(correctReport.historicalAsOfSupported).toBe(false);
    });

    it('rejects writes inside read-only report transaction', async () => {
      const { organizationId } = await createGtOrgVehicle(prisma);
      await expect(
        prisma.$transaction(async (tx) => {
          await assertHvH1TransactionReadOnly(tx as never);
          await tx.organization.update({
            where: { id: organizationId },
            data: { companyName: 'mutated' },
          });
        }),
      ).rejects.toThrow();
    });
  },
);
