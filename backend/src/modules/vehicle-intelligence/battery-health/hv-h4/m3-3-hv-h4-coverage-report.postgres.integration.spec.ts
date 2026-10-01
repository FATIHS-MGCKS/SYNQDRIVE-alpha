import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryGroundTruthVerificationStatus,
  PrismaClient,
} from '@prisma/client';
import {
  createGtOrgVehicle,
  insertGtBatteryReplacementServiceEvent,
} from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '../hv-charge-session/hv-charge-session.types';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { assertHvH4TransactionReadOnly } from './m3-3-hv-h4-readonly-transaction';
import { runM3_3HvH4CoverageReport } from './m3-3-hv-h4-coverage-report.service';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const REPLACEMENT_AT = new Date('2026-06-01T00:00:00.000Z');
const EVALUATION_AT = new Date('2026-09-01T00:00:00.000Z');

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4 coverage report postgres',
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

    it('segments lifecycle sources and charge-session throughput trust read-only', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);

      await prisma.hvBatteryHealthSnapshot.createMany({
        data: [
          {
            vehicleId,
            recordedAt: new Date('2026-05-10T08:00:00.000Z'),
            socPercent: 55,
          },
          {
            vehicleId,
            recordedAt: new Date('2026-07-10T08:00:00.000Z'),
            socPercent: 62,
          },
        ],
      });

      await prisma.batteryEvidence.createMany({
        data: [
          {
            vehicleId,
            scope: BatteryEvidenceScope.HV,
            sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
            valueType: BatteryEvidenceValueType.SOC_PERCENT,
            numericValue: 54,
            unit: 'percent',
            observedAt: new Date('2026-05-12T08:00:00.000Z'),
          },
          {
            vehicleId,
            scope: BatteryEvidenceScope.HV,
            sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
            valueType: BatteryEvidenceValueType.SOC_PERCENT,
            numericValue: 61,
            unit: 'percent',
            observedAt: new Date('2026-07-12T08:00:00.000Z'),
          },
        ],
      });

      await prisma.batteryGroundTruthEvent.create({
        data: {
          organizationId,
          vehicleId,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          batteryScope: BatteryEvidenceScope.HV,
          effectiveAt: REPLACEMENT_AT,
          sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          sourceContentFingerprint:
            randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32),
          sourceServiceEventId: await insertGtBatteryReplacementServiceEvent(prisma, {
            organizationId,
            vehicleId,
            eventDate: REPLACEMENT_AT,
          }),
        },
      });

      const sessionBase = {
        organizationId,
        vehicleId,
        startSocPercent: 20,
        endSocPercent: 80,
        startEnergyKwh: 10,
        endEnergyKwh: 40,
        deltaSocPercent: 60,
      };

      await prisma.hvChargeSession.createMany({
        data: [
          {
            ...sessionBase,
            id: randomUUID(),
            segmentFingerprint: `fp-pre-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-05-01T08:00:00.000Z'),
            endAt: new Date('2026-05-01T12:00:00.000Z'),
            energyAddedKwh: 12,
            idempotencyKey: `idem-pre-${randomUUID()}`,
            metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          },
          {
            ...sessionBase,
            id: randomUUID(),
            segmentFingerprint: `fp-cross-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-05-31T22:00:00.000Z'),
            endAt: new Date('2026-06-01T04:00:00.000Z'),
            energyAddedKwh: 15,
            idempotencyKey: `idem-cross-${randomUUID()}`,
            metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          },
          {
            ...sessionBase,
            id: randomUUID(),
            segmentFingerprint: `fp-post-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-05T08:00:00.000Z'),
            endAt: new Date('2026-07-05T12:00:00.000Z'),
            energyAddedKwh: 18,
            idempotencyKey: `idem-post-${randomUUID()}`,
            metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          },
          {
            ...sessionBase,
            id: randomUUID(),
            segmentFingerprint: `fp-fb-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
            startAt: new Date('2026-07-20T08:00:00.000Z'),
            endAt: new Date('2026-07-20T10:00:00.000Z'),
            energyAddedKwh: 6,
            idempotencyKey: `idem-fb-${randomUUID()}`,
            metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          },
          {
            ...sessionBase,
            id: randomUUID(),
            segmentFingerprint: `fp-ongoing-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-08-28T08:00:00.000Z'),
            endAt: null,
            energyAddedKwh: 4,
            isOngoing: true,
            idempotencyKey: `idem-ongoing-${randomUUID()}`,
            metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          },
        ],
      });

      await prisma.$transaction(async (tx) => {
        await assertHvH4TransactionReadOnly(tx);
      });

      const report = await runM3_3HvH4CoverageReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });

      const seg0Odom = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'ODOMETER_KM',
      );
      const seg1Odom = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'ODOMETER_KM',
      );
      expect(seg0Odom?.latestObservedAt).toBe('2026-05-10T08:00:00.000Z');
      expect(seg1Odom?.earliestObservedAt).toBe('2026-07-10T08:00:00.000Z');

      const seg0Soc = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'SOC_WINDOW_EXPOSURE',
      );
      const seg1Soc = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'SOC_WINDOW_EXPOSURE',
      );
      expect(seg0Soc?.latestObservedAt).toBe('2026-05-12T08:00:00.000Z');
      expect(seg1Soc?.earliestObservedAt).toBe('2026-07-12T08:00:00.000Z');

      const cross = report.chargeSessionClassifications.find((c) =>
        c.reasonCodes.includes('REPLACEMENT_BOUNDARY_INTERSECTION'),
      );
      expect(cross?.futureThroughputEligibility).toBe('INELIGIBLE_REPLACEMENT_INTERSECTION');

      const fallback = report.chargeSessionClassifications.find(
        (c) => c.futureThroughputEligibility === 'CONTEXT_ONLY',
      );
      expect(fallback).toBeDefined();

      const ongoing = report.chargeSessionClassifications.find(
        (c) => c.futureThroughputEligibility === 'INELIGIBLE_ONGOING',
      );
      expect(ongoing).toBeDefined();

      const seg0Throughput = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'CHARGE_THROUGHPUT_KWH',
      );
      const seg1Throughput = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'CHARGE_THROUGHPUT_KWH',
      );

      expect(seg0Throughput?.earliestTrustedAt).toBe('2026-05-01T08:00:00.000Z');
      expect(seg1Throughput?.earliestTrustedAt).toBe('2026-07-05T08:00:00.000Z');
      expect(seg1Throughput?.earliestObservedAt).not.toBe('2026-05-01T08:00:00.000Z');

      expect(report.energySemanticFirewall.prohibitedChargeThroughputSources).toContain(
        'VehicleEnergyEvent.energyDeltaKwh',
      );
      expect(report.chargeSessionSourceLoad.sourceTruncated).toBe(false);
    });
  },
);
