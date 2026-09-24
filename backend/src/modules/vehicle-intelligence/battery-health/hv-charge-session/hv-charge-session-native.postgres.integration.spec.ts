import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import { dedupeNormalizedRechargeSegmentsByFingerprint } from '@modules/dimo/recharge-segments/dimo-recharge-segments.dedupe';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import { withSyntheticProviderId } from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures.synthetic';
import { PrismaService } from '@shared/database/prisma.service';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import { HvChargeSessionPersistService } from './hv-charge-session-persist.service';

const LIVE = process.env.ERD_E2_POSTGRES_INTEGRATION === '1';

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

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E2 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E2${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E2-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'ERD',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

(LIVE ? describe : describe.skip)(
  'ERD E2 native HvChargeSession PostgreSQL gate (ERD_E2_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let persist: HvChargeSessionPersistService;

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('ERD_E2_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      const repository = new HvChargeSessionRepository(prisma as unknown as PrismaService);
      persist = new HvChargeSessionPersistService(
        repository,
        { log: jest.fn() } as never,
        { maybeEnqueueAfterSessionPersist: jest.fn().mockResolvedValue(null) } as never,
      );
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('A–F: native session idempotency, ongoing completion, provider id, dedupe, malformed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const completedRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
        const completed = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          completedRaw,
        )!;
        expect(completed).not.toBeNull();

        const first = await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: completed,
        });
        const replay = await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: completed,
        });
        expect(first.created).toBe(true);
        expect(replay.created).toBe(false);
        expect(replay.changeKind).toBe('no_op');

        const countAfterReplay = await prisma.hvChargeSession.count({
          where: { vehicleId: vehicle.id },
        });
        expect(countAfterReplay).toBe(1);

        const start = completed.startAt;
        const fingerprint = completed.fingerprint;
        const ongoing = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
          start: { timestamp: start, value: {} },
          end: null,
          duration: 600,
          isOngoing: true,
          signals: completedRaw.signals,
        })!;
        expect(ongoing.fingerprint).toBe(fingerprint);

        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: ongoing,
        });

        const completedSameStart = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          completedRaw,
        )!;
        const done = await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: completedSameStart,
        });
        expect(done.changeKind).toBe('completed');

        const row = await prisma.hvChargeSession.findUnique({
          where: {
            vehicleId_segmentFingerprint: {
              vehicleId: vehicle.id,
              segmentFingerprint: fingerprint,
            },
          },
        });
        expect(row?.isOngoing).toBe(false);
        expect(row?.startAt.toISOString()).toBe(new Date(start).toISOString());

        const sparse = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1];
        const withoutId = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, sparse)!;
        const withId = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          withSyntheticProviderId(sparse),
        )!;
        const deduped = dedupeNormalizedRechargeSegmentsByFingerprint([withoutId, withId]);
        expect(deduped).toHaveLength(1);
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: deduped[0],
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: withId,
        });
        const countProvider = await prisma.hvChargeSession.count({
          where: { vehicleId: vehicle.id, segmentFingerprint: withoutId.fingerprint },
        });
        expect(countProvider).toBe(1);

        const malformed = normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, {
          start: { timestamp: 'bad' },
          isOngoing: false,
          signals: [],
        });
        expect(malformed).toBeNull();

        const total = await prisma.hvChargeSession.count({ where: { vehicleId: vehicle.id } });
        expect(total).toBeGreaterThanOrEqual(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
