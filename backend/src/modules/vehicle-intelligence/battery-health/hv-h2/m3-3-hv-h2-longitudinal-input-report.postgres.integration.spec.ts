import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryGroundTruthVerificationStatus,
  BatteryMeasurementQuality,
  PrismaClient,
} from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  assertHvH2TransactionReadOnly,
  runM3_3HvH2LongitudinalInputReport,
} from './m3-3-hv-h2-longitudinal-input-report.service';

const integrationEnabled = process.env.BATTERY_HV_H2_REPORT_INTEGRATION === '1';

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H2 longitudinal input report postgres',
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

    it('enforces transaction_read_only inside H2 read-only transaction', async () => {
      await prisma.$transaction(async (tx) => {
        await assertHvH2TransactionReadOnly(tx as never);
        const rows = await tx.$queryRaw<{ transaction_read_only: string }[]>`
          SHOW transaction_read_only
        `;
        expect(rows[0]?.transaction_read_only).toBe('on');
      });
    });

    it('scopes reads to organizationId + vehicleId (tenant isolation)', async () => {
      const orgA = await createGtOrgVehicle(prisma);
      const orgB = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2026-09-30T12:00:00.000Z');

      await prisma.batteryEvidence.create({
        data: {
          vehicleId: orgA.vehicleId,
          scope: BatteryEvidenceScope.HV,
          sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          numericValue: 91,
          unit: 'percent',
          observedAt: new Date('2026-09-29T00:00:00.000Z'),
          provider: 'DIMO',
        },
      });

      const wrongOrg = runM3_3HvH2LongitudinalInputReport(prisma, {
        organizationId: orgB.organizationId,
        vehicleId: orgA.vehicleId,
        evaluationAt,
      });
      await expect(wrongOrg).rejects.toThrow(/not found/i);

      await expect(
        runM3_3HvH2LongitudinalInputReport(prisma, {
          organizationId: orgB.organizationId,
          vehicleId: orgB.vehicleId,
          evaluationAt,
        }),
      ).resolves.toMatchObject({
        organizationId: orgB.organizationId,
        vehicleId: orgB.vehicleId,
        summary: { providerSohCount: 0 },
      });
    });

    it('loads M2/M3 observations and provider SOH with deterministic repeat', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2026-09-30T12:00:00.000Z');
      const sessionId = randomUUID();

      await prisma.hvChargeSession.create({
        data: {
          id: sessionId,
          organizationId,
          vehicleId,
          segmentFingerprint: `fp-${randomUUID()}`,
          source: 'DIMO_RECHARGE_SEGMENT',
          startAt: new Date('2026-09-28T08:00:00.000Z'),
          endAt: new Date('2026-09-28T12:00:00.000Z'),
          idempotencyKey: `idem-${randomUUID()}`,
          metadata: {
            qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
            capacityValidationEligible: true,
          },
        },
      });

      await prisma.hvCapacityObservation.create({
        data: {
          organizationId,
          vehicleId,
          method: HV_M2_CAPACITY_METHOD,
          observedAt: new Date('2026-09-28T10:00:00.000Z'),
          idempotencyKey: `m2-${randomUUID()}`,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
          estimatedCapacityKwh: 59,
          chargeSessionId: sessionId,
        },
      });

      await prisma.hvCapacityObservation.create({
        data: {
          organizationId,
          vehicleId,
          method: HV_M3_CAPACITY_METHOD,
          observedAt: new Date('2026-09-28T10:30:00.000Z'),
          idempotencyKey: `m3-${randomUUID()}`,
          quality: BatteryMeasurementQuality.VALID_PROXY,
          modelVersion: 1,
          estimatedCapacityKwh: 58.5,
          chargeSessionId: sessionId,
          deltaSocPercent: 50,
          deltaEnergyKwh: 28,
        },
      });

      await prisma.batteryEvidence.create({
        data: {
          vehicleId,
          scope: BatteryEvidenceScope.HV,
          sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          numericValue: 93,
          unit: 'percent',
          observedAt: new Date('2026-09-27T00:00:00.000Z'),
          provider: 'DIMO',
        },
      });

      await prisma.batteryGroundTruthEvent.create({
        data: {
          organizationId,
          vehicleId,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          batteryScope: BatteryEvidenceScope.HV,
          effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
          sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          sourceContentFingerprint: 'c'.repeat(64),
          sourceServiceEventId: randomUUID(),
        },
      });

      const input = { organizationId, vehicleId, evaluationAt };
      const first = await runM3_3HvH2LongitudinalInputReport(prisma, input);
      const second = await runM3_3HvH2LongitudinalInputReport(prisma, input);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(first.summary.m2Count).toBeGreaterThanOrEqual(1);
      expect(first.summary.m3Count).toBeGreaterThanOrEqual(1);
      expect(first.summary.providerSohCount).toBeGreaterThanOrEqual(1);
      expect(first.summary.replacementBoundaryCount).toBe(1);
      expect(first.dbReadOnlyTransactionEnforced).toBe(true);
      expect(first.healthConclusion).toBeNull();
    });

    it('rejects writes inside read-only report transaction', async () => {
      const { organizationId } = await createGtOrgVehicle(prisma);
      await expect(
        prisma.$transaction(async (tx) => {
          await assertHvH2TransactionReadOnly(tx as never);
          await tx.organization.update({
            where: { id: organizationId },
            data: { companyName: 'mutated-h2' },
          });
        }),
      ).rejects.toThrow();
    });
  },
);
