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
    let repository: HvChargeSessionRepository;
    const evaluatedAt = new Date('2026-07-16T14:00:00.000Z');

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('ERD_E3_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      repository = new HvChargeSessionRepository(prisma as unknown as PrismaService);
      const metrics = { erdE3ConvergenceTotal: { inc: jest.fn() } } as never;
      const convergence = new HvChargeSessionNativeFallbackConvergenceService(
        prisma as unknown as PrismaService,
        repository,
        metrics,
      );
      persist = new HvChargeSessionPersistService(
        repository,
        { log: jest.fn() } as never,
        { maybeEnqueueAfterSessionPersist: jest.fn().mockResolvedValue(null) } as never,
        convergence,
      );
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
        const draft = mapFallbackCandidateToHvChargeSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          reconciledAt: evaluatedAt,
        });

        const first = await persist.persistSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          draft,
        });
        const replay = await persist.persistSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          draft,
        });
        expect(first.created).toBe(true);
        expect(replay.changeKind).toBe('no_op');
        expect(await prisma.hvChargeSession.count({ where: { vehicleId: vehicle.id } })).toBe(1);

        const ongoingDraft = mapFallbackCandidateToHvChargeSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: {
            ...candidate,
            endAt: null,
            endSocPercent: null,
            deltaSocPercent: null,
            isOngoing: true,
            endReason: 'ONGOING',
          },
          reconciledAt: evaluatedAt,
        });
        const ongoing = await persist.persistSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          draft: {
            ...ongoingDraft,
            segmentFingerprint: `poll-charge:${vehicle.id}:${new Date('2026-07-16T18:00:00.000Z').getTime()}`,
            startAt: new Date('2026-07-16T18:00:00.000Z'),
          },
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

        const fbDraft = mapFallbackCandidateToHvChargeSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: fallbackDetection.sessions[0],
          reconciledAt: evaluatedAt,
        });
        await persist.persistSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          draft: fbDraft,
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
        const fb2 = mapFallbackCandidateToHvChargeSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: {
            ...fallbackDetection.sessions[0],
            startAt: new Date('2026-07-10T08:00:00.000Z'),
            endAt: new Date('2026-07-10T09:00:00.000Z'),
            startSocPercent: 10,
            endSocPercent: 12,
          },
          reconciledAt: evaluatedAt,
        });
        fb2.segmentFingerprint = `poll-charge:${vehicle.id}:${fb2.startAt.getTime()}`;
        await persist.persistSessionDraft({
          organizationId: org.id,
          vehicleId: vehicle.id,
          draft: fb2,
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: differentSegment,
          evaluatedAt,
        });
        const fb2Row = await prisma.hvChargeSession.findFirst({
          where: { vehicleId: vehicle.id, segmentFingerprint: fb2.segmentFingerprint },
        });
        expect(
          (fb2Row?.metadata as { supersededBySegmentFingerprint?: string })
            ?.supersededBySegmentFingerprint,
        ).toBeUndefined();
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
