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
import {
  createGtOrgVehicle,
  insertGtBatteryReplacementServiceEvent,
} from '../ground-truth/ground-truth-postgres.fixture';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { assertHvH2TransactionReadOnly, runM3_3HvH2LongitudinalInputReport } from '../hv-h2/m3-3-hv-h2-longitudinal-input-report.service';
import { M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1 } from './m3-3-hv-h3.constants';
import { runM3_3HvH3LongitudinalTrendReport } from './m3-3-hv-h3-trend-report.service';

const integrationEnabled = process.env.BATTERY_HV_H3_REPORT_INTEGRATION === '1';

async function seedQualifiedSession(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  startAt: Date,
): Promise<void> {
  await prisma.hvChargeSession.create({
    data: {
      id: sessionId,
      organizationId,
      vehicleId,
      segmentFingerprint: `fp-${randomUUID()}`,
      source: 'DIMO_RECHARGE_SEGMENT',
      startAt,
      endAt: new Date(startAt.getTime() + 4 * 3600 * 1000),
      startSocPercent: 40,
      endSocPercent: 90,
      startEnergyKwh: 20,
      endEnergyKwh: 48,
      energyAddedKwh: 28,
      deltaSocPercent: 50,
      idempotencyKey: `idem-${randomUUID()}`,
      metadata: {
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        capacityValidationEligible: true,
      },
    },
  });
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H3 longitudinal trend report postgres',
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

    it('chains H2 → H3 read-only with deterministic repeat and no DB writes', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2027-06-01T00:00:00.000Z');
      const sessionId = randomUUID();
      await seedQualifiedSession(
        prisma,
        organizationId,
        vehicleId,
        sessionId,
        new Date('2026-09-28T08:00:00.000Z'),
      );

      await prisma.hvCapacityObservation.createMany({
        data: [
          {
            organizationId,
            vehicleId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-28T10:00:00.000Z'),
            idempotencyKey: `m2a-${randomUUID()}`,
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 59,
            chargeSessionId: sessionId,
          },
          {
            organizationId,
            vehicleId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-28T10:15:00.000Z'),
            idempotencyKey: `m2b-${randomUUID()}`,
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 61,
            chargeSessionId: sessionId,
          },
        ],
      });

      const session2 = randomUUID();
      await seedQualifiedSession(
        prisma,
        organizationId,
        vehicleId,
        session2,
        new Date('2026-10-01T08:00:00.000Z'),
      );
      await prisma.hvCapacityObservation.create({
        data: {
          organizationId,
          vehicleId,
          method: HV_M2_CAPACITY_METHOD,
          observedAt: new Date('2026-10-01T10:00:00.000Z'),
          idempotencyKey: `m2c-${randomUUID()}`,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
          estimatedCapacityKwh: 58,
          chargeSessionId: session2,
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

      await prisma.batteryEvidence.createMany({
        data: [
          {
            vehicleId,
            scope: BatteryEvidenceScope.HV,
            sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
            valueType: BatteryEvidenceValueType.SOH_PERCENT,
            numericValue: 93,
            unit: 'percent',
            observedAt: new Date('2026-09-27T00:00:00.000Z'),
            provider: 'DIMO',
          },
          {
            vehicleId,
            scope: BatteryEvidenceScope.HV,
            sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
            valueType: BatteryEvidenceValueType.SOH_PERCENT,
            numericValue: 91,
            unit: 'percent',
            observedAt: new Date('2026-09-26T00:00:00.000Z'),
            provider: 'HIGH_MOBILITY',
          },
        ],
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
          sourceContentFingerprint: 'd'.repeat(64),
          sourceServiceEventId: await insertGtBatteryReplacementServiceEvent(prisma, {
            organizationId,
            vehicleId,
            eventDate: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      });

      const obsBefore = await prisma.hvCapacityObservation.count({
        where: { organizationId, vehicleId },
      });

      const input = { organizationId, vehicleId, evaluationAt };
      const h2 = await runM3_3HvH3LongitudinalTrendReport(prisma, input).then(() =>
        import('../hv-h2/m3-3-hv-h2-longitudinal-input-report.service').then((m) =>
          m.runM3_3HvH2LongitudinalInputReport(prisma, input),
        ),
      );
      expect(h2.candidates.filter((c) => c.method === 'M3_ADDED_ENERGY_DELTA_SOC' && c.eligibility === 'eligible').length).toBeGreaterThanOrEqual(1);

      const a = await runM3_3HvH3LongitudinalTrendReport(prisma, input);
      const b = await runM3_3HvH3LongitudinalTrendReport(prisma, input);

      const obsAfter = await prisma.hvCapacityObservation.count({
        where: { organizationId, vehicleId },
      });
      expect(obsAfter).toBe(obsBefore);

      expect(a.contractVersion).toBe(M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1);
      expect(a.degradationConclusion).toBeNull();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));

      const m2Series = a.lifecycleSegments.flatMap((s) =>
        s.methodSeries.filter((m) => m.method === 'M2_CURRENT_ENERGY_SOC'),
      );
      expect(m2Series.length).toBeGreaterThanOrEqual(1);
      const sessionOnePoints = m2Series.flatMap((s) =>
        s.trendPoints.filter((p) => p.sessionId === sessionId),
      );
      expect(sessionOnePoints).toHaveLength(1);
      expect(sessionOnePoints[0]?.sourceCandidateCount).toBe(2);
      expect(sessionOnePoints[0]?.numericValue).toBeCloseTo(60, 5);

      const m3Series = a.lifecycleSegments.flatMap((s) =>
        s.methodSeries.filter((m) => m.method === 'M3_ADDED_ENERGY_DELTA_SOC'),
      );
      expect(m3Series.length).toBeGreaterThanOrEqual(1);
      expect(m3Series.every((s) => s.primaryTrendEligible === false)).toBe(true);
      expect(m3Series.every((s) => s.scientificRole === 'VALIDATION_ONLY')).toBe(true);

      const providerSeries = a.lifecycleSegments.flatMap((s) =>
        s.methodSeries.filter((m) => m.method === 'PROVIDER_HV_SOH'),
      );
      expect(providerSeries.length).toBeGreaterThanOrEqual(2);
      expect(new Set(providerSeries.map((s) => s.provider)).size).toBeGreaterThanOrEqual(2);

      const segmentIds = new Set(m2Series.map((s) => s.lifecycleSegmentId));
      expect(segmentIds.size).toBeGreaterThanOrEqual(2);
    });

    it('rejects cross-tenant H3 read (inherits H2 vehicle scope)', async () => {
      const orgA = await createGtOrgVehicle(prisma);
      const orgB = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2027-06-01T00:00:00.000Z');

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

      await expect(
        runM3_3HvH3LongitudinalTrendReport(prisma, {
          organizationId: orgB.organizationId,
          vehicleId: orgA.vehicleId,
          evaluationAt,
        }),
      ).rejects.toThrow(/not found/i);

      const isolated = await runM3_3HvH3LongitudinalTrendReport(prisma, {
        organizationId: orgB.organizationId,
        vehicleId: orgB.vehicleId,
        evaluationAt,
      });
      expect(isolated.lifecycleSegments.flatMap((s) => s.methodSeries)).toHaveLength(0);
    });

    it('inherits H2 read-only transaction write rejection', async () => {
      const { organizationId } = await createGtOrgVehicle(prisma);
      await expect(
        prisma.$transaction(async (tx) => {
          await assertHvH2TransactionReadOnly(tx as never);
          await tx.organization.update({
            where: { id: organizationId },
            data: { companyName: 'mutated-h3-chain' },
          });
        }),
      ).rejects.toThrow();
    });
  },
);
