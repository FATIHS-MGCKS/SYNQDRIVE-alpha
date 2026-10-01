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
import { M3_3_HV_H4_DEFAULT_RETENTION_DAYS } from './m3-3-hv-h4.constants';

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
            recordedAt: REPLACEMENT_AT,
            socPercent: 56,
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
          createdAt: REPLACEMENT_AT,
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

      const reportA = await runM3_3HvH4CoverageReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });
      const reportB = await runM3_3HvH4CoverageReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });
      expect(reportA).toEqual(reportB);

      const seg0Odom = reportA.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'ODOMETER_KM',
      );
      const seg1Odom = reportA.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'ODOMETER_KM',
      );
      expect(seg0Odom?.latestObservedAt).toBe('2026-05-10T08:00:00.000Z');
      expect(seg1Odom?.earliestObservedAt).toBe(REPLACEMENT_AT.toISOString());

      const seg0SocEvidence = reportA.axes
        .find((a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'SOC_WINDOW_EXPOSURE')
        ?.sourceSummaries.find((s) => s.source.includes('BatteryEvidence.SOC'));
      const seg1SocEvidence = reportA.axes
        .find((a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'SOC_WINDOW_EXPOSURE')
        ?.sourceSummaries.find((s) => s.source.includes('BatteryEvidence.SOC'));
      expect(seg0SocEvidence?.latestObservedAt).toBe('2026-05-12T08:00:00.000Z');
      expect(seg1SocEvidence?.earliestObservedAt).toBe('2026-07-12T08:00:00.000Z');

      const cross = reportA.chargeSessionClassifications.find((c) =>
        c.reasonCodes.includes('REPLACEMENT_BOUNDARY_INTERSECTION'),
      );
      expect(cross?.futureThroughputEligibility).toBe('INELIGIBLE_REPLACEMENT_INTERSECTION');

      const fallback = reportA.chargeSessionClassifications.find(
        (c) => c.futureThroughputEligibility === 'CONTEXT_ONLY',
      );
      expect(fallback).toBeDefined();

      const ongoing = reportA.chargeSessionClassifications.find(
        (c) => c.futureThroughputEligibility === 'INELIGIBLE_ONGOING',
      );
      expect(ongoing).toBeDefined();

      const seg0Throughput = reportA.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'CHARGE_THROUGHPUT_KWH',
      );
      const seg1Throughput = reportA.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_1' && a.axis === 'CHARGE_THROUGHPUT_KWH',
      );

      expect(seg0Throughput?.earliestTrustedAt).toBe('2026-05-01T08:00:00.000Z');
      expect(seg0Throughput?.evidenceStart.boundaryKind).toBe('FIRST_QUALIFIED_SESSION');
      expect(seg1Throughput?.earliestTrustedAt).toBe('2026-07-05T08:00:00.000Z');
      expect(seg1Throughput?.earliestObservedAt).not.toBe('2026-05-01T08:00:00.000Z');

      expect(reportA.energySemanticFirewall.pass).toBe(true);
      expect(reportA.energySemanticFirewall.chargeThroughputSource).toBe(
        'HvChargeSession.energyAddedKwh',
      );
      expect(reportA.energySemanticFirewall.prohibitedChargeThroughputSources).toContain(
        'VehicleEnergyEvent.energyDeltaKwh',
      );
      expect(reportA.cumulativeExposureValues).toBe(false);
      expect(reportA.chargeSessionSourceLoad.sourceTruncated).toBe(false);

      const policyCutoff = new Date(
        EVALUATION_AT.getTime() -
          M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvProviderSnapshots * 86_400_000,
      );
      const cal = reportA.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'CALENDAR_TIME',
      );
      if (cal?.earliestObservedAt === policyCutoff.toISOString()) {
        expect(cal.retentionInference).not.toBe('ACTUAL_RETENTION_TRUNCATION_CONFIRMED');
        expect(cal.gapSummary.gapKind).not.toBe('TRUNCATED_HISTORY');
      }

      await expect(
        runM3_3HvH4CoverageReport(prisma, {
          organizationId: randomUUID(),
          vehicleId,
          evaluationAt: EVALUATION_AT,
        }),
      ).rejects.toThrow(/not found for organization/);
    });

    it('keeps earliestTrustedAt null when segment has observations but no ELIGIBLE_NATIVE session', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);

      await prisma.hvChargeSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          segmentFingerprint: `fp-fb-only-${randomUUID()}`,
          source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
          startAt: new Date('2026-07-01T08:00:00.000Z'),
          endAt: new Date('2026-07-01T10:00:00.000Z'),
          startSocPercent: 20,
          endSocPercent: 70,
          startEnergyKwh: 10,
          endEnergyKwh: 35,
          energyAddedKwh: 8,
          deltaSocPercent: 50,
          idempotencyKey: `idem-fb-only-${randomUUID()}`,
          metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
        },
      });

      const report = await runM3_3HvH4CoverageReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });

      const throughput = report.axes.find(
        (a) => a.lifecycleSegmentId === 'HV_SEGMENT_0' && a.axis === 'CHARGE_THROUGHPUT_KWH',
      );
      expect(throughput?.earliestObservedAt).not.toBeNull();
      expect(throughput?.earliestTrustedAt).toBeNull();
      expect(throughput?.segmentEvidenceState).toBe('OBSERVED_CONTEXT_ONLY');
    });
  },
);
