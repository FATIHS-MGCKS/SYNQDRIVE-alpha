import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
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
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import { runM3_3HvH4ChargeThroughputReport } from './m3-3-hv-h4-charge-throughput-report.service';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const REPLACEMENT_AT = new Date('2026-06-01T00:00:00.000Z');
const EVALUATION_AT = new Date('2026-09-01T00:00:00.000Z');

function nativeMeta() {
  return {
    qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
    addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
  };
}

/** Durable row timestamps knowable at historical evaluationAt (A2 knowledge-as-of). */
function sessionRowKnowledgeAsOf(input: { startAt: Date; endAt: Date | null }) {
  const anchor = input.endAt ?? input.startAt;
  return {
    createdAt: anchor,
    receivedAt: anchor,
    updatedAt: anchor,
    providerObservedAt: input.endAt ?? input.startAt,
  };
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A2 charge throughput postgres',
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

    it('composes bounded charge throughput per lifecycle segment read-only', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);

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

      const base = {
        organizationId,
        vehicleId,
        startSocPercent: 20,
        endSocPercent: 80,
        startEnergyKwh: 10,
        endEnergyKwh: 40,
        deltaSocPercent: 60,
        metadata: nativeMeta(),
      };

      await prisma.hvChargeSession.createMany({
        data: [
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-pre-1-${randomUUID()}`,
            dimoSegmentId: `d-pre-1-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-05-01T08:00:00.000Z'),
            endAt: new Date('2026-05-01T10:00:00.000Z'),
            energyAddedKwh: 12,
            idempotencyKey: `idem-pre-1-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-05-01T08:00:00.000Z'),
              endAt: new Date('2026-05-01T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-pre-2-${randomUUID()}`,
            dimoSegmentId: `d-pre-2-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-05-20T08:00:00.000Z'),
            endAt: new Date('2026-05-20T10:00:00.000Z'),
            energyAddedKwh: 8,
            idempotencyKey: `idem-pre-2-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-05-20T08:00:00.000Z'),
              endAt: new Date('2026-05-20T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-cross-${randomUUID()}`,
            dimoSegmentId: `d-cross-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-05-31T22:00:00.000Z'),
            endAt: new Date('2026-06-01T04:00:00.000Z'),
            energyAddedKwh: 15,
            idempotencyKey: `idem-cross-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-05-31T22:00:00.000Z'),
              endAt: new Date('2026-06-01T04:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-post-${randomUUID()}`,
            dimoSegmentId: `d-post-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-05T08:00:00.000Z'),
            endAt: new Date('2026-07-05T10:00:00.000Z'),
            energyAddedKwh: 18,
            idempotencyKey: `idem-post-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-07-05T08:00:00.000Z'),
              endAt: new Date('2026-07-05T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-fb-${randomUUID()}`,
            dimoSegmentId: `d-fb-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
            startAt: new Date('2026-07-20T08:00:00.000Z'),
            endAt: new Date('2026-07-20T10:00:00.000Z'),
            energyAddedKwh: 6,
            idempotencyKey: `idem-fb-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-07-20T08:00:00.000Z'),
              endAt: new Date('2026-07-20T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-super-${randomUUID()}`,
            dimoSegmentId: `d-super-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
            startAt: new Date('2026-07-22T08:00:00.000Z'),
            endAt: new Date('2026-07-22T10:00:00.000Z'),
            energyAddedKwh: 5,
            idempotencyKey: `idem-super-${randomUUID()}`,
            metadata: {
              ...nativeMeta(),
              supersededBySegmentFingerprint: 'native-fp',
            },
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-07-22T08:00:00.000Z'),
              endAt: new Date('2026-07-22T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-ongoing-${randomUUID()}`,
            dimoSegmentId: `d-ongoing-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-08-28T08:00:00.000Z'),
            endAt: null,
            energyAddedKwh: 4,
            isOngoing: true,
            idempotencyKey: `idem-ongoing-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-08-28T08:00:00.000Z'),
              endAt: null,
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-missing-${randomUUID()}`,
            dimoSegmentId: `d-missing-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-08-01T08:00:00.000Z'),
            endAt: new Date('2026-08-01T10:00:00.000Z'),
            energyAddedKwh: null,
            idempotencyKey: `idem-missing-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-08-01T08:00:00.000Z'),
              endAt: new Date('2026-08-01T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-zero-${randomUUID()}`,
            dimoSegmentId: `d-zero-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-08-02T08:00:00.000Z'),
            endAt: new Date('2026-08-02T10:00:00.000Z'),
            energyAddedKwh: 0,
            idempotencyKey: `idem-zero-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-08-02T08:00:00.000Z'),
              endAt: new Date('2026-08-02T10:00:00.000Z'),
            }),
          },
        ],
      });

      const report = await runM3_3HvH4ChargeThroughputReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });

      const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
      const seg1 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_1');
      expect(seg0?.boundedObservedChargeThroughputKwh).toBe(20);
      expect(seg1?.boundedObservedChargeThroughputKwh).toBe(18);
      expect(report.energySemanticFirewall.prohibitedChargeThroughputSources).toContain(
        'VehicleEnergyEvent.energyDeltaKwh',
      );

      await expect(
        runM3_3HvH4ChargeThroughputReport(prisma, {
          organizationId: randomUUID(),
          vehicleId,
          evaluationAt: EVALUATION_AT,
        }),
      ).rejects.toThrow(/not found for organization/);
    });

    it('fail-closes duplicate metadata.providerSegmentId in postgres', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const sharedProvider = `provider-dup-${randomUUID()}`;
      const base = {
        organizationId,
        vehicleId,
        startSocPercent: 20,
        endSocPercent: 80,
        startEnergyKwh: 10,
        endEnergyKwh: 40,
        deltaSocPercent: 60,
        metadata: {
          ...nativeMeta(),
          providerSegmentId: sharedProvider,
        },
      };
      await prisma.hvChargeSession.createMany({
        data: [
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-a-${randomUUID()}`,
            dimoSegmentId: `d-a-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 5,
            idempotencyKey: `idem-a-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-07-01T08:00:00.000Z'),
              endAt: new Date('2026-07-01T10:00:00.000Z'),
            }),
          },
          {
            ...base,
            id: randomUUID(),
            segmentFingerprint: `fp-b-${randomUUID()}`,
            dimoSegmentId: `d-b-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-02T08:00:00.000Z'),
            endAt: new Date('2026-07-02T10:00:00.000Z'),
            energyAddedKwh: 7,
            idempotencyKey: `idem-b-${randomUUID()}`,
            ...sessionRowKnowledgeAsOf({
              startAt: new Date('2026-07-02T08:00:00.000Z'),
              endAt: new Date('2026-07-02T10:00:00.000Z'),
            }),
          },
        ],
      });
      const report = await runM3_3HvH4ChargeThroughputReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVALUATION_AT,
      });
      const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
      expect(seg0?.compositionStatus).toBe('SOURCE_CONFLICT');
      expect(seg0?.boundedObservedChargeThroughputKwh).toBeNull();
      expect(seg0?.reasonCodes).toContain('DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID');
    });

    it('excludes sessions created or updated after evaluationAt in postgres', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const historicalEval = new Date('2026-08-01T00:00:00.000Z');
      await prisma.hvChargeSession.createMany({
        data: [
          {
            organizationId,
            vehicleId,
            id: randomUUID(),
            segmentFingerprint: `fp-ok-${randomUUID()}`,
            dimoSegmentId: `d-ok-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-01T08:00:00.000Z'),
            endAt: new Date('2026-07-01T10:00:00.000Z'),
            energyAddedKwh: 9,
            startSocPercent: 20,
            endSocPercent: 80,
            startEnergyKwh: 10,
            endEnergyKwh: 40,
            deltaSocPercent: 60,
            metadata: nativeMeta(),
            idempotencyKey: `idem-ok-${randomUUID()}`,
            createdAt: new Date('2026-07-01T09:00:00.000Z'),
            updatedAt: new Date('2026-07-01T09:00:00.000Z'),
            receivedAt: new Date('2026-07-01T09:00:00.000Z'),
          },
          {
            organizationId,
            vehicleId,
            id: randomUUID(),
            segmentFingerprint: `fp-late-${randomUUID()}`,
            dimoSegmentId: `d-late-${randomUUID()}`,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
            startAt: new Date('2026-07-05T08:00:00.000Z'),
            endAt: new Date('2026-07-05T10:00:00.000Z'),
            energyAddedKwh: 11,
            startSocPercent: 20,
            endSocPercent: 80,
            startEnergyKwh: 10,
            endEnergyKwh: 40,
            deltaSocPercent: 60,
            metadata: nativeMeta(),
            idempotencyKey: `idem-late-${randomUUID()}`,
            createdAt: new Date('2026-08-02T00:00:00.000Z'),
            updatedAt: new Date('2026-07-05T10:00:00.000Z'),
            receivedAt: new Date('2026-07-05T10:00:00.000Z'),
          },
        ],
      });
      const report = await runM3_3HvH4ChargeThroughputReport(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: historicalEval,
      });
      const seg0 = report.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0');
      expect(seg0?.boundedObservedChargeThroughputKwh).toBe(9);
      expect(report.sessionKnowledgeAsOfPolicy).toBe(
        'CURRENT_ROW_MUST_NOT_POSTDATE_EVALUATION_AT',
      );
    });
  },
);
