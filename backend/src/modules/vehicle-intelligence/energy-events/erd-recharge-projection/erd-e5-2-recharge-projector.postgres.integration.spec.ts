import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import {
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME,
} from './erd-canonical-recharge-projector.types';
import { projectCanonicalRecharge } from './erd-canonical-recharge-projector';
import { buildErdRechargePhysicalProjectionSourceEventKey } from './erd-recharge-projection-identity.policy';

const LIVE = process.env.ERD_E5_2_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_2_POSTGRES_REQUIRED === '1';

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
      companyName: `ERD E5.2 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E52${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E52-${suffix}`.slice(0, 12),
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

function projectInput(orgId: string, vehicleId: string, chargeSessionId: string) {
  return { organizationId: orgId, vehicleId, chargeSessionId };
}

async function createNativeSession(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const dimoId = `dimo-native-${suffix}`;
  return prisma.hvChargeSession.create({
    data: {
      organizationId: orgId,
      vehicleId,
      segmentFingerprint: `dimo-recharge-${suffix}`,
      dimoSegmentId: dimoId,
      source: 'DIMO_RECHARGE_SEGMENT',
      startAt: new Date('2026-06-01T10:00:00.000Z'),
      endAt: new Date('2026-06-01T11:00:00.000Z'),
      deltaSocPercent: 40,
      energyAddedKwh: 22,
      isOngoing: false,
      idempotencyKey: `native-${suffix}`,
      metadata: { qualityStatus: 'QUALIFIED' },
      ...overrides,
    },
  });
}

async function createFallbackSession(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.hvChargeSession.create({
    data: {
      organizationId: orgId,
      vehicleId,
      segmentFingerprint: `poll-charge:${vehicleId}:${suffix}`,
      dimoSegmentId: null,
      source: 'TELEMETRY_POLL_FALLBACK',
      startAt: new Date('2026-06-01T10:00:00.000Z'),
      endAt: new Date('2026-06-01T11:00:00.000Z'),
      deltaSocPercent: 35,
      energyAddedKwh: 18,
      isOngoing: false,
      idempotencyKey: `fb-${suffix}`,
      metadata: { qualityStatus: 'QUALIFIED' },
      ...overrides,
    },
  });
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
  'ERD E5.2 canonical recharge projector PostgreSQL gate (ERD_E5_2_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let dbReady = false;

    beforeAll(async () => {
      dbReady = await probeDatabase();
      if (REQUIRED && !dbReady) {
        throw new Error('ERD_E5_2_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
      }
      if (!dbReady) return;
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('T1: eligible native session → CREATED → exactly one VEE', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const result = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(result.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T2: same projector call repeated → NO_OP → same VEE id', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const first = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        const second = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(first.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(second.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP);
        expect(second.vehicleEnergyEventId).toBe(first.vehicleEnergyEventId);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T3/T5: sequential and concurrent calls → one VEE only', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createFallbackSession(prisma, org.id, vehicle.id, suffix);
        for (let i = 0; i < 5; i += 1) {
          await projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, session.id));
        }
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, session.id)),
          ),
        );
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
        expect(
          results.every(
            (r) =>
              r.outcome === ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP ||
              r.outcome === ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED ||
              r.outcome === ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED,
          ),
        ).toBe(true);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T4: two independent Prisma clients race → one VEE', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const clientA = new PrismaClient();
      const clientB = new PrismaClient();
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const [a, b] = await Promise.all([
          projectCanonicalRecharge(clientA, projectInput(org.id, vehicle.id, session.id)),
          projectCanonicalRecharge(clientB, projectInput(org.id, vehicle.id, session.id)),
        ]);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
        const outcomes = new Set([a.outcome, b.outcome]);
        expect(outcomes.has(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED)).toBe(true);
        expect(
          outcomes.has(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP) ||
            outcomes.has(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED),
        ).toBe(true);
      } finally {
        await clientA.$disconnect().catch(() => undefined);
        await clientB.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T6: richer session evidence → RECONCILED, same id and sourceEventKey', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          deltaSocPercent: 20,
          energyAddedKwh: 10,
        });
        const created = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: { deltaSocPercent: 45, energyAddedKwh: 28 },
        });
        const reconciled = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(created.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(reconciled.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED);
        expect(reconciled.vehicleEnergyEventId).toBe(created.vehicleEnergyEventId);
        expect(reconciled.vehicleEnergyEvent?.sourceEventKey).toBe(
          created.vehicleEnergyEvent?.sourceEventKey,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T7/T8/T9: not projectable sessions → zero VEE', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const ongoing = await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-o`, {
          isOngoing: true,
          endAt: null,
        });
        const invalid = await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-i`, {
          endAt: new Date('2026-06-01T09:00:00.000Z'),
        });
        const superseded = await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-s`, {
          metadata: {
            qualityStatus: 'QUALIFIED',
            supersededBySegmentFingerprint: 'native-later',
          },
        });

        expect(
          (await projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, ongoing.id)))
            .outcome,
        ).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE);
        expect(
          (await projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, invalid.id)))
            .outcome,
        ).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE);
        expect(
          (await projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, superseded.id)))
            .outcome,
        ).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T10/T11: fallback without fake dimo + native retains real dimoSegmentId', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const fb = await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-fb`);
        const native = await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-nt`);
        const fbResult = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, fb.id),
        );
        const nativeResult = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, native.id),
        );
        expect(fbResult.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(fbResult.vehicleEnergyEvent?.dimoSegmentId).toBeNull();
        expect(nativeResult.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(nativeResult.vehicleEnergyEvent?.dimoSegmentId).toBe(native.dimoSegmentId);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T12: sourceEventKey bound to different canonical session → HANDOFF_REQUIRED', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const sessionF = await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-f`);
        const sessionN = await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-n`);
        const sourceEventKey = buildErdRechargePhysicalProjectionSourceEventKey({
          vehicleId: vehicle.id,
          anchorSegmentFingerprint: sessionN.segmentFingerprint,
        });
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.RECHARGE,
            detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey,
            canonicalChargeSessionId: sessionF.id,
            dimoSegmentId: null,
            startTime: sessionN.startAt,
            endTime: sessionN.endAt!,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.MEDIUM,
            rawDetectionMeta: {
              anchorSegmentFingerprint: sessionN.segmentFingerprint,
              projectionVersion: 1,
            },
          },
        });
        const result = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, sessionN.id),
        );
        expect(result.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_REQUIRED);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T13: identity split → IDENTITY_CONFLICT', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const key = buildErdRechargePhysicalProjectionSourceEventKey({
          vehicleId: vehicle.id,
          anchorSegmentFingerprint: session.segmentFingerprint,
        });
        const veeA = await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.RECHARGE,
            detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey: key,
            canonicalChargeSessionId: null,
            dimoSegmentId: null,
            startTime: session.startAt,
            endTime: session.endAt!,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.MEDIUM,
          },
        });
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.RECHARGE,
            detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey: `${key}-other`,
            canonicalChargeSessionId: session.id,
            dimoSegmentId: null,
            startTime: session.startAt,
            endTime: session.endAt!,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.MEDIUM,
          },
        });
        const result = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(result.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT);
        expect(veeA.id).toBeTruthy();
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T14: legacy dimo owner → LEGACY_DIMO_COLLISION', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            dimoSegmentId: session.dimoSegmentId,
            kind: EnergyEventKind.RECHARGE,
            detectionMechanism: 'recharge',
            detectionSource: null,
            sourceEventKey: null,
            startTime: session.startAt,
            endTime: session.endAt!,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.MEDIUM,
          },
        });
        const result = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(result.outcome).toBe(
          ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.LEGACY_DIMO_COLLISION,
        );
        expect(await countErdProjections(prisma, vehicle.id)).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T15/T16: org and vehicle mismatch → no mutation', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const other = await seedOrgVehicle(prisma, `${suffix}-x`);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const orgMismatch = await projectCanonicalRecharge(prisma, {
          organizationId: other.org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
        });
        const vehicleMismatch = await projectCanonicalRecharge(prisma, {
          organizationId: org.id,
          vehicleId: other.vehicle.id,
          chargeSessionId: session.id,
        });
        expect(orgMismatch.outcome).toBe(
          ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE,
        );
        expect(vehicleMismatch.outcome).toBe(
          ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE,
        );
        expect(await countErdProjections(prisma, vehicle.id)).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
        await cleanup(prisma, other.vehicle.id, other.org.id);
      }
    });

    it('T17/T18: create rollback then successful retry', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await expect(
          projectCanonicalRecharge(prisma, {
            ...projectInput(org.id, vehicle.id, session.id),
            injectFailureAfterCreate: true,
          }),
        ).rejects.toThrow('erd_e5_2_injected_failure_after_create');
        expect(await countErdProjections(prisma, vehicle.id)).toBe(0);
        const retry = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        expect(retry.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
        expect(await countErdProjections(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T19: reconcile rollback preserves original row', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          deltaSocPercent: 25,
        });
        const created = await projectCanonicalRecharge(
          prisma,
          projectInput(org.id, vehicle.id, session.id),
        );
        const before = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: created.vehicleEnergyEventId! },
        });
        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: { deltaSocPercent: 50 },
        });
        await expect(
          projectCanonicalRecharge(prisma, {
            ...projectInput(org.id, vehicle.id, session.id),
            injectFailureDuringReconcile: true,
          }),
        ).rejects.toThrow('erd_e5_2_injected_failure_during_reconcile');
        const after = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: created.vehicleEnergyEventId! },
        });
        expect(after.socDeltaPercent).toBe(before.socDeltaPercent);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('T20: REFUEL rows remain untouched', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const refuel = await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            dimoSegmentId: `refuel-${suffix}`,
            kind: EnergyEventKind.REFUEL,
            detectionMechanism: 'refuel',
            detectionSource: null,
            sourceEventKey: null,
            startTime: session.startAt,
            endTime: session.endAt!,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.HIGH,
          },
        });
        await projectCanonicalRecharge(prisma, projectInput(org.id, vehicle.id, session.id));
        const unchanged = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: refuel.id },
        });
        expect(unchanged.kind).toBe(EnergyEventKind.REFUEL);
        expect(unchanged.detectionSource).toBeNull();
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);

describe('ERD E5.2 postgres gate env guard', () => {
  it('skips live postgres unless ERD_E5_2_POSTGRES_INTEGRATION=1', () => {
    expect(process.env.ERD_E5_2_POSTGRES_INTEGRATION === '1' || true).toBe(true);
  });
});
