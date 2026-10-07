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
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { runM3_3HvH4LiveDurableModeAParityV1 } from './m3-3-hv-h4-a3-parity.harness.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const REPLACEMENT_AT = new Date('2026-06-01T00:00:00.000Z');
const EVAL = new Date('2026-09-01T00:00:00.000Z');
const KNOWABLE = new Date('2026-05-01T10:00:00.000Z');

async function createNativeSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    startAt: Date;
    endAt: Date;
    energyAddedKwh: number;
    createdAt?: Date;
    receivedAt?: Date;
    updatedAt?: Date;
  },
) {
  return prisma.hvChargeSession.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: `fp-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: input.startAt,
      endAt: input.endAt,
      energyAddedKwh: input.energyAddedKwh,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: input.createdAt ?? KNOWABLE,
      receivedAt: input.receivedAt ?? KNOWABLE,
      updatedAt: input.updatedAt ?? KNOWABLE,
      providerObservedAt: input.endAt,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    },
  });
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.6-R0 multi-lifecycle live/durable MODE_A parity (postgres)',
  () => {
    let prisma: PrismaClient;
    let writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('HV BATTERY_REPLACEMENT splits segments; live === durable MODE_A at evaluationAt after replacement', async () => {
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

      const pre = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
        endAt: new Date('2026-05-01T10:00:00.000Z'),
        energyAddedKwh: 12,
      });
      const pre2 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-15T08:00:00.000Z'),
        endAt: new Date('2026-05-15T10:00:00.000Z'),
        energyAddedKwh: 8,
      });
      const post = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-07-05T08:00:00.000Z'),
        endAt: new Date('2026-07-05T10:00:00.000Z'),
        energyAddedKwh: 18,
        createdAt: new Date('2026-07-05T10:00:00.000Z'),
        receivedAt: new Date('2026-07-05T10:00:00.000Z'),
        updatedAt: new Date('2026-07-05T10:00:00.000Z'),
      });

      await writer.persistFromHvChargeSession(pre);
      await writer.persistFromHvChargeSession(pre2);
      await writer.persistFromHvChargeSession(post);

      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );

      expect(bundle.live.coverage.lifecycleSegments.map((s) => s.lifecycleSegmentId)).toEqual([
        'HV_SEGMENT_0',
        'HV_SEGMENT_1',
      ]);

      const seg0Live = bundle.live.throughput.segments.find(
        (s) => s.lifecycleSegmentId === 'HV_SEGMENT_0',
      );
      const seg1Live = bundle.live.throughput.segments.find(
        (s) => s.lifecycleSegmentId === 'HV_SEGMENT_1',
      );
      expect(seg0Live).toBeDefined();
      expect(seg1Live).toBeDefined();
      expect(seg0Live?.boundedObservedChargeThroughputKwh).toBe(20);
      expect(seg1Live?.boundedObservedChargeThroughputKwh).toBe(18);

      const seg0Durable = bundle.durable.throughput.segments.find(
        (s) => s.lifecycleSegmentId === 'HV_SEGMENT_0',
      );
      const seg1Durable = bundle.durable.throughput.segments.find(
        (s) => s.lifecycleSegmentId === 'HV_SEGMENT_1',
      );
      expect(seg0Durable).toEqual(seg0Live);
      expect(seg1Durable).toEqual(seg1Live);
    });
  },
);
