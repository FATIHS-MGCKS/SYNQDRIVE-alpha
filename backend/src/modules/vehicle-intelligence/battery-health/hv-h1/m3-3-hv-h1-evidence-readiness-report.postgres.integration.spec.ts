import { randomUUID } from 'crypto';
import {
  BatteryCapabilityStatus,
  BatteryMeasurementQuality,
  PrismaClient,
} from '@prisma/client';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  assertHvH1TransactionReadOnly,
  runM3_3HvH1EvidenceReadinessReport,
} from './m3-3-hv-h1-evidence-readiness-report.service';

const integrationEnabled = process.env.BATTERY_HV_H1_REPORT_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `HV H1 ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'EV',
      2024,
      'ELECTRIC'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`H1-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

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
      const orgA = await createOrgVehicle(prisma);
      const orgB = await createOrgVehicle(prisma);
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
          metadata: { qualityStatus: 'QUALIFIED', capacityValidationEligible: true },
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
      const { organizationId, vehicleId } = await createOrgVehicle(prisma);
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
