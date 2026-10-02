import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import { PrismaService } from '@shared/database/prisma.service';
import { mapFallbackCandidateToHvChargeSessionDraft } from './hv-fallback-charge-session.mapper';
import { detectFallbackChargeSessions } from './hv-fallback-charge-session.policy';
import type { HvFallbackChargeObservation } from './hv-fallback-charge-session.types';
import { HV_FALLBACK_DETECTION_TIER } from './hv-fallback-charge-session.types';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import { HvChargeSessionPersistService } from './hv-charge-session-persist.service';
import { HvChargeSessionNativeFallbackConvergenceService } from './hv-charge-session-native-fallback-convergence.service';

function buildAuthorityStack(client: PrismaClient) {
  const repository = new HvChargeSessionRepository(client as unknown as PrismaService);
  const metrics = { erdE3ConvergenceTotal: { inc: jest.fn() } } as never;
  const convergence = new HvChargeSessionNativeFallbackConvergenceService(
    client as unknown as PrismaService,
    repository,
    metrics,
  );
  const persist = new HvChargeSessionPersistService(
    repository,
    { log: jest.fn() } as never,
    { maybeEnqueueAfterSessionPersist: jest.fn().mockResolvedValue(null) } as never,
    convergence,
  );
  return { client, repository, convergence, persist, metrics };
}

async function countActiveFallback(prisma: PrismaClient, vehicleId: string): Promise<number> {
  const rows = await prisma.hvChargeSession.findMany({
    where: { vehicleId, source: 'TELEMETRY_POLL_FALLBACK' },
  });
  return rows.filter(
    (row) =>
      !(row.metadata as { supersededBySegmentFingerprint?: string })
        ?.supersededBySegmentFingerprint,
  ).length;
}

const LIVE = process.env.ERD_E3_POSTGRES_INTEGRATION === '1';

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
      companyName: `ERD E3 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E3${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E3-${suffix}`.slice(0, 12),
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

function lteR1Observations(base: Date): HvFallbackChargeObservation[] {
  const rows: HvFallbackChargeObservation[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const charging = i >= 1 && i <= 10;
    rows.push({
      recordedAt: new Date(base.getTime() + i * 5 * 60_000),
      providerReceivedAt: new Date(base.getTime() + i * 5 * 60_000),
      socPercent: 35 + i * 0.9,
      energyKwh: 18 + i * 0.5,
      isCharging: charging,
      cableConnected: charging,
      chargingPowerKw: charging ? 7.4 : null,
      addedEnergyKwh: charging ? i * 0.45 : 0,
    });
  }
  return rows;
}

(LIVE ? describe : describe.skip)(
  'ERD E3 fallback + convergence PostgreSQL gate (ERD_E3_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let persist: HvChargeSessionPersistService;
    let convergence: HvChargeSessionNativeFallbackConvergenceService;
    let repository: HvChargeSessionRepository;
    const evaluatedAt = new Date('2026-07-16T14:00:00.000Z');

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('ERD_E3_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      const stack = buildAuthorityStack(prisma);
      repository = stack.repository;
      convergence = stack.convergence;
      persist = stack.persist;
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('A–C: fallback persist, replay idempotency, ongoing completion', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const base = new Date('2026-07-16T06:00:00.000Z');
        const detection = detectFallbackChargeSessions(lteR1Observations(base), evaluatedAt);
        expect(detection.sessions.length).toBeGreaterThanOrEqual(1);

        const candidate = detection.sessions[0];

        const first = await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          evaluatedAt,
        });
        const replay = await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          evaluatedAt,
        });
        expect(first.created).toBe(true);
        expect(replay.changeKind).toBe('no_op');
        expect(await prisma.hvChargeSession.count({ where: { vehicleId: vehicle.id } })).toBe(1);

        const ongoingCandidate = {
          ...candidate,
          endAt: null,
          endSocPercent: null,
          deltaSocPercent: null,
          isOngoing: true,
          endReason: 'ONGOING' as const,
          startAt: new Date('2026-07-16T18:00:00.000Z'),
        };
        const ongoing = await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: ongoingCandidate,
          evaluatedAt,
        });
        expect(ongoing.created).toBe(true);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('D–E: SOC-only and power-only noise do not persist via policy', () => {
      const base = new Date('2026-07-16T06:00:00.000Z');
      const socOnly: HvFallbackChargeObservation[] = [];
      for (let i = 0; i < 8; i += 1) {
        socOnly.push({
          recordedAt: new Date(base.getTime() + i * 5 * 60_000),
          providerReceivedAt: new Date(base.getTime() + i * 5 * 60_000),
          socPercent: 30 + i * 2,
          energyKwh: 20,
          isCharging: null,
          cableConnected: null,
          chargingPowerKw: null,
          addedEnergyKwh: null,
        });
      }
      expect(detectFallbackChargeSessions(socOnly, evaluatedAt).sessions).toHaveLength(0);

      const powerOnly: HvFallbackChargeObservation[] = [];
      for (let i = 0; i < 8; i += 1) {
        powerOnly.push({
          recordedAt: new Date(base.getTime() + i * 5 * 60_000),
          providerReceivedAt: new Date(base.getTime() + i * 5 * 60_000),
          socPercent: 40,
          energyKwh: 20,
          isCharging: null,
          cableConnected: null,
          chargingPowerKw: i % 2 === 0 ? 3 : 0.2,
          addedEnergyKwh: null,
        });
      }
      expect(detectFallbackChargeSessions(powerOnly, evaluatedAt).sessions).toHaveLength(0);
    });

    it('F–K: native SAME atomic supersession, DIFFERENT, provider delay convergence', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const segmentRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
        const nativeSegment = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          segmentRaw,
        )!;

        const base = new Date(nativeSegment.startAt);
        const alignedObservations = lteR1Observations(
          new Date(base.getTime() - 15 * 60_000),
        );
        const fallbackDetection = detectFallbackChargeSessions(
          alignedObservations,
          evaluatedAt,
        );
        expect(fallbackDetection.sessions.length).toBeGreaterThanOrEqual(1);

        await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: fallbackDetection.sessions[0],
          evaluatedAt,
        });

        const converge = await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });
        expect(converge.changed).toBe(true);

        const rows = await prisma.hvChargeSession.findMany({
          where: { vehicleId: vehicle.id },
        });
        expect(rows.some((row) => row.source === 'DIMO_RECHARGE_SEGMENT')).toBe(true);
        const superseded = rows.find((row) => row.source === 'TELEMETRY_POLL_FALLBACK');
        expect(superseded?.metadata).toMatchObject({
          supersededBySegmentFingerprint: nativeSegment.fingerprint,
        });

        const differentSegment = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[1],
        )!;
        await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: {
            ...fallbackDetection.sessions[0],
            startAt: new Date('2026-07-10T08:00:00.000Z'),
            endAt: new Date('2026-07-10T09:00:00.000Z'),
            startSocPercent: 10,
            endSocPercent: 12,
          },
          evaluatedAt,
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: differentSegment,
          evaluatedAt,
        });
        const fb2Row = await prisma.hvChargeSession.findFirst({
          where: {
            vehicleId: vehicle.id,
            startAt: new Date('2026-07-10T08:00:00.000Z'),
          },
        });
        expect(
          (fb2Row?.metadata as { supersededBySegmentFingerprint?: string })
            ?.supersededBySegmentFingerprint,
        ).toBeUndefined();
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('E3.1: independent Prisma clients + authority race matrix', async () => {
      const prismaA = new PrismaClient();
      const prismaB = new PrismaClient();
      expect(prismaA).not.toBe(prismaB);

      const stackA = buildAuthorityStack(prismaA);
      const stackB = buildAuthorityStack(prismaB);

      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prismaA, suffix);
      const segmentRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
      const nativeSegment = normalizeDimoRechargeSegment(
        TESLA_RECHARGE_AUDIT_TOKEN_ID,
        segmentRaw,
      )!;
      const base = new Date(nativeSegment.startAt);
      const candidate = detectFallbackChargeSessions(
        lteR1Observations(new Date(base.getTime() - 15 * 60_000)),
        evaluatedAt,
      ).sessions[0];
      expect(candidate).toBeDefined();

      try {
        await stackA.persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });

        const fallbackAfterNative =
          await stackB.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidate,
            evaluatedAt,
          });
        expect(fallbackAfterNative.authority.skipped).toBe(true);
        expect(await countActiveFallback(prismaA, vehicle.id)).toBe(0);

        await cleanup(prismaA, vehicle.id, org.id);
        const suffix2 = `${suffix}-b`;
        const seeded = await seedOrgVehicle(prismaA, suffix2);
        const vehicle2 = seeded.vehicle;
        const org2 = seeded.org;

        await stackB.convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org2.id,
          vehicleId: vehicle2.id,
          candidate,
          evaluatedAt,
        });

        await stackA.persist.persistRechargeSegment({
          organizationId: org2.id,
          vehicleId: vehicle2.id,
          segment: nativeSegment,
          evaluatedAt,
        });

        const rows = await prismaA.hvChargeSession.findMany({
          where: { vehicleId: vehicle2.id },
        });
        expect(rows.filter((r) => r.source === 'DIMO_RECHARGE_SEGMENT')).toHaveLength(1);
        const superseded = rows.filter((r) => r.source === 'TELEMETRY_POLL_FALLBACK');
        expect(superseded).toHaveLength(1);
        expect(
          (superseded[0].metadata as { supersededBySegmentFingerprint?: string })
            ?.supersededBySegmentFingerprint,
        ).toBe(nativeSegment.fingerprint);
        expect(await countActiveFallback(prismaA, vehicle2.id)).toBe(0);

        const suffixFbRace = `${suffix}-fb-race`;
        const seededFbRace = await seedOrgVehicle(prismaA, suffixFbRace);
        await Promise.all([
          stackA.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: seededFbRace.org.id,
            vehicleId: seededFbRace.vehicle.id,
            candidate,
            evaluatedAt,
          }),
          stackB.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: seededFbRace.org.id,
            vehicleId: seededFbRace.vehicle.id,
            candidate,
            evaluatedAt,
          }),
        ]);
        expect(await countActiveFallback(prismaA, seededFbRace.vehicle.id)).toBe(1);

        await cleanup(prismaA, seededFbRace.vehicle.id, seededFbRace.org.id);
        await cleanup(prismaA, vehicle2.id, org2.id);

        const suffix3 = `${suffix}-c`;
        const seeded3 = await seedOrgVehicle(prismaA, suffix3);
        const vehicle3 = seeded3.vehicle;
        const org3 = seeded3.org;
        const lateWindow = lteR1Observations(new Date(base.getTime() + 20 * 60_000));
        const lateCandidate = detectFallbackChargeSessions(lateWindow, evaluatedAt).sessions[0];
        const firstPersist =
          await stackA.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: org3.id,
            vehicleId: vehicle3.id,
            candidate: lateCandidate,
            evaluatedAt,
          });
        const fp1 = firstPersist.session!.segmentFingerprint;

        const wideCandidate = detectFallbackChargeSessions(
          lteR1Observations(new Date(base.getTime() - 30 * 60_000)),
          evaluatedAt,
        ).sessions[0];
        const replay =
          await stackB.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: org3.id,
            vehicleId: vehicle3.id,
            candidate: wideCandidate,
            evaluatedAt,
          });
        expect(replay.session!.segmentFingerprint).toBe(fp1);
        expect(await prismaA.hvChargeSession.count({ where: { vehicleId: vehicle3.id } })).toBe(
          1,
        );

        const suffixTrunc = `${suffix}-trunc`;
        const seededTrunc = await seedOrgVehicle(prismaA, suffixTrunc);
        const fullFirst =
          await stackA.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: seededTrunc.org.id,
            vehicleId: seededTrunc.vehicle.id,
            candidate: wideCandidate,
            evaluatedAt,
          });
        const anchoredStart = fullFirst.session!.startAt.getTime();
        const truncatedCandidate = detectFallbackChargeSessions(
          lteR1Observations(new Date(base.getTime() + 20 * 60_000)),
          evaluatedAt,
        ).sessions[0];
        const truncatedReplay =
          await stackB.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: seededTrunc.org.id,
            vehicleId: seededTrunc.vehicle.id,
            candidate: truncatedCandidate,
            evaluatedAt,
          });
        expect(truncatedReplay.session!.segmentFingerprint).toBe(
          fullFirst.session!.segmentFingerprint,
        );
        expect(truncatedReplay.session!.startAt.getTime()).toBe(anchoredStart);
        expect(
          await prismaA.hvChargeSession.count({ where: { vehicleId: seededTrunc.vehicle.id } }),
        ).toBe(1);
        await cleanup(prismaA, seededTrunc.vehicle.id, seededTrunc.org.id);

        await Promise.all([
          stackA.persist.persistRechargeSegment({
            organizationId: org3.id,
            vehicleId: vehicle3.id,
            segment: nativeSegment,
            evaluatedAt,
          }),
          stackB.persist.persistRechargeSegment({
            organizationId: org3.id,
            vehicleId: vehicle3.id,
            segment: nativeSegment,
            evaluatedAt,
          }),
        ]);
        expect(
          await prismaA.hvChargeSession.count({
            where: { vehicleId: vehicle3.id, source: 'DIMO_RECHARGE_SEGMENT' },
          }),
        ).toBe(1);

        const suffix4 = `${suffix}-d`;
        const seeded4 = await seedOrgVehicle(prismaA, suffix4);
        await stackA.convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: seeded4.org.id,
          vehicleId: seeded4.vehicle.id,
          candidate,
          evaluatedAt,
        });
        await expect(
          stackA.convergence.persistNativeWithFallbackConvergence({
            organizationId: seeded4.org.id,
            vehicleId: seeded4.vehicle.id,
            segment: nativeSegment,
            evaluatedAt,
            injectFailureAfterSupersede: true,
          }),
        ).rejects.toThrow();
        const fbRow = await prismaA.hvChargeSession.findFirst({
          where: {
            vehicleId: seeded4.vehicle.id,
            source: 'TELEMETRY_POLL_FALLBACK',
          },
        });
        expect(
          (fbRow?.metadata as { supersededBySegmentFingerprint?: string })
            ?.supersededBySegmentFingerprint,
        ).toBeUndefined();

        await cleanup(prismaA, seeded4.vehicle.id, seeded4.org.id);
        await cleanup(prismaA, vehicle3.id, org3.id);

        const suffixFbRollback = `${suffix}-fb-rollback`;
        const seededFbRb = await seedOrgVehicle(prismaA, suffixFbRollback);
        await expect(
          stackA.convergence.persistProvisionalFallbackUnderAuthorityLock({
            organizationId: seededFbRb.org.id,
            vehicleId: seededFbRb.vehicle.id,
            candidate,
            evaluatedAt,
            injectFailureBeforeCommit: true,
          }),
        ).rejects.toThrow();
        expect(await countActiveFallback(prismaA, seededFbRb.vehicle.id)).toBe(0);
        await cleanup(prismaA, seededFbRb.vehicle.id, seededFbRb.org.id);
      } finally {
        await prismaA.$disconnect().catch(() => undefined);
        await prismaB.$disconnect().catch(() => undefined);
      }
    });
  },
);
