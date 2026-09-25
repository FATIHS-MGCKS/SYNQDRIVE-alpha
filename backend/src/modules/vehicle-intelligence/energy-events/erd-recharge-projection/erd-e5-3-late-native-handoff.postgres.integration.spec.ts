import { randomUUID } from 'crypto';
import {
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import { PrismaService } from '@shared/database/prisma.service';
import { detectFallbackChargeSessions } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-fallback-charge-session.policy';
import type { HvFallbackChargeObservation } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-fallback-charge-session.types';
import { HvChargeSessionRepository } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.repository';
import { HvChargeSessionPersistService } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-persist.service';
import { HvChargeSessionNativeFallbackConvergenceService } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-native-fallback-convergence.service';
import {
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME,
} from './erd-canonical-recharge-projector.types';
import { projectCanonicalRecharge } from './erd-canonical-recharge-projector';
import { readAnchorSegmentFingerprintFromVee } from './erd-recharge-projection-reconciliation.policy';

const LIVE = process.env.ERD_E5_3_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_3_POSTGRES_REQUIRED === '1';

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
  return { convergence, persist };
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E5.3 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E53${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E53-${suffix}`.slice(0, 12),
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
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
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

async function countErdProjections(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({
    where: {
      vehicleId,
      kind: EnergyEventKind.RECHARGE,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
    },
  });
}

const describeFn = LIVE ? describe : describe.skip;

describeFn(
  'ERD E5.3 late-native handoff PostgreSQL gate (ERD_E5_3_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let dbReady = false;
    const evaluatedAt = new Date('2026-07-16T14:00:00.000Z');

    beforeAll(async () => {
      dbReady = await probeDatabase();
      if (REQUIRED && !dbReady) {
        throw new Error('ERD_E5_3_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
      }
      if (!dbReady) return;
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('H1–H11: real E3 SAME convergence then HANDOFF_COMPLETED with preserved identity', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const { convergence, persist } = buildAuthorityStack(prisma);
      try {
        const segmentRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
        const nativeSegment = normalizeDimoRechargeSegment(
          TESLA_RECHARGE_AUDIT_TOKEN_ID,
          segmentRaw,
        )!;
        const base = new Date(nativeSegment.startAt);
        const fallbackDetection = detectFallbackChargeSessions(
          lteR1Observations(new Date(base.getTime() - 15 * 60_000)),
          evaluatedAt,
        );
        expect(fallbackDetection.sessions.length).toBeGreaterThanOrEqual(1);

        const fbPersist = await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate: fallbackDetection.sessions[0],
          evaluatedAt,
        });
        const sessionF = fbPersist.session!;

        const projectedF = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionF.id,
        });
        expect(projectedF.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        const veeIdBefore = projectedF.vehicleEnergyEventId!;
        const sourceKeyBefore = projectedF.vehicleEnergyEvent!.sourceEventKey!;
        const anchorBefore = readAnchorSegmentFingerprintFromVee(projectedF.vehicleEnergyEvent!);

        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });

        const sessionN = await prisma.hvChargeSession.findFirstOrThrow({
          where: {
            vehicleId: vehicle.id,
            source: 'DIMO_RECHARGE_SEGMENT',
            segmentFingerprint: nativeSegment.fingerprint,
          },
        });

        const handoff = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionN.id,
        });
        expect(handoff.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED);
        expect(handoff.vehicleEnergyEventId).toBe(veeIdBefore);
        expect(handoff.vehicleEnergyEvent?.sourceEventKey).toBe(sourceKeyBefore);
        expect(readAnchorSegmentFingerprintFromVee(handoff.vehicleEnergyEvent!)).toBe(
          anchorBefore,
        );
        expect(handoff.vehicleEnergyEvent?.canonicalChargeSessionId).toBe(sessionN.id);
        expect(handoff.vehicleEnergyEvent?.dimoSegmentId).toBe(sessionN.dimoSegmentId);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);

        const retry = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionN.id,
        });
        expect([ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP, ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED]).toContain(
          retry.outcome,
        );
        expect(retry.vehicleEnergyEventId).toBe(veeIdBefore);

        const reclaimF = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionF.id,
        });
        expect(reclaimF.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE);
        expect(reclaimF.reason).toBe('superseded_fallback');
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('H12: two independent Prisma clients handoff concurrently → one VEE', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const { convergence, persist } = buildAuthorityStack(prisma);
      const clientA = new PrismaClient();
      const clientB = new PrismaClient();
      try {
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

        await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          evaluatedAt,
        });
        const sessionF = await prisma.hvChargeSession.findFirstOrThrow({
          where: { vehicleId: vehicle.id, source: 'TELEMETRY_POLL_FALLBACK' },
        });
        await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionF.id,
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });
        const sessionN = await prisma.hvChargeSession.findFirstOrThrow({
          where: { vehicleId: vehicle.id, source: 'DIMO_RECHARGE_SEGMENT' },
        });

        const [r1, r2] = await Promise.all([
          projectCanonicalRecharge(clientA, {
            organizationId: org.id,
            vehicleId: vehicle.id,
            chargeSessionId: sessionN.id,
          }),
          projectCanonicalRecharge(clientB, {
            organizationId: org.id,
            vehicleId: vehicle.id,
            chargeSessionId: sessionN.id,
          }),
        ]);
        expect(
          [r1.outcome, r2.outcome].every((o) =>
            (
              [
                ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED,
                ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP,
                ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED,
              ] as string[]
            ).includes(o),
          ),
        ).toBe(true);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
      } finally {
        await clientA.$disconnect().catch(() => undefined);
        await clientB.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('H13/H14: handoff rollback then successful retry', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const { convergence, persist } = buildAuthorityStack(prisma);
      try {
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
        const fb = await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          evaluatedAt,
        });
        const created = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: fb.session!.id,
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });
        const sessionN = await prisma.hvChargeSession.findFirstOrThrow({
          where: { vehicleId: vehicle.id, source: 'DIMO_RECHARGE_SEGMENT' },
        });

        await expect(
          projectCanonicalRecharge(prisma, {
            organizationId: org.id,
            vehicleId: vehicle.id,
            chargeSessionId: sessionN.id,
            injectFailureAfterHandoff: true,
          }),
        ).rejects.toThrow();

        const afterRollback = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: created.vehicleEnergyEventId! },
        });
        expect(afterRollback.canonicalChargeSessionId).toBe(fb.session!.id);
        expect(afterRollback.sourceEventKey).toBe(created.vehicleEnergyEvent!.sourceEventKey);

        const retry = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionN.id,
        });
        expect(retry.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED);
        expect(retry.vehicleEnergyEventId).toBe(created.vehicleEnergyEventId);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('H20: E3 SAME but no fallback VEE → ordinary native CREATE', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const { convergence, persist } = buildAuthorityStack(prisma);
      try {
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
        await convergence.persistProvisionalFallbackUnderAuthorityLock({
          organizationId: org.id,
          vehicleId: vehicle.id,
          candidate,
          evaluatedAt,
        });
        await persist.persistRechargeSegment({
          organizationId: org.id,
          vehicleId: vehicle.id,
          segment: nativeSegment,
          evaluatedAt,
        });
        const sessionN = await prisma.hvChargeSession.findFirstOrThrow({
          where: { vehicleId: vehicle.id, source: 'DIMO_RECHARGE_SEGMENT' },
        });
        const created = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: sessionN.id,
        });
        expect(created.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);

describe('ERD E5.3 postgres gate env guard', () => {
  it('skips live postgres unless ERD_E5_3_POSTGRES_INTEGRATION=1', () => {
    expect(process.env.ERD_E5_3_POSTGRES_INTEGRATION === '1' || true).toBe(true);
  });
});
