import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildCanonicalShadowCandidates } from './canonical-shadow-cohort.policy';
import {
  buildLegacyDirectDimoRechargeWhere,
  isLegacyDirectDimoRechargeRow,
} from './legacy-recharge-cohort.policy';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import { ErdRechargeShadowParityRepository } from './erd-recharge-shadow-parity.repository';
import { ErdRechargeShadowParityRuntimeService } from './erd-recharge-shadow-parity.runtime';
import { ErdRechargeShadowParityService } from './erd-recharge-shadow-parity.service';
import {
  ERD_RECHARGE_SHADOW_FIELD_SEVERITY,
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
  ERD_RECHARGE_SHADOW_RUN_RESULT,
} from './erd-recharge-shadow-parity.types';

const LIVE = process.env.ERD_E5_4_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_4_POSTGRES_REQUIRED === '1';

const WINDOW_FROM = new Date('2026-06-01T00:00:00.000Z');
const WINDOW_TO = new Date('2026-06-02T23:59:59.999Z');
const SESSION_START = new Date('2026-06-01T10:00:00.000Z');
const SESSION_END = new Date('2026-06-01T11:00:00.000Z');

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
      companyName: `ERD E5.4 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E54${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E54-${suffix}`.slice(0, 12),
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

async function cleanup(
  prisma: PrismaClient,
  vehicleId: string,
  organizationId: string,
) {
  await prisma.erdRechargeProjectionShadowObservation
    .deleteMany({ where: { vehicleId } })
    .catch(() => undefined);
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

function buildShadowParityService(client: PrismaClient) {
  const repository = new ErdRechargeShadowParityRepository(client as unknown as PrismaService);
  const metrics = {
    recordRun: jest.fn(),
    recordObservation: jest.fn(),
  } as never;
  return new ErdRechargeShadowParityService(
    client as unknown as PrismaService,
    repository,
    metrics,
  );
}

function evaluateInput(organizationId: string, vehicleId: string) {
  return {
    organizationId,
    vehicleId,
    windowFrom: WINDOW_FROM,
    windowTo: WINDOW_TO,
    evaluatedAt: new Date('2026-06-15T12:00:00.000Z'),
  };
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
      startAt: SESSION_START,
      endAt: SESSION_END,
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
      startAt: SESSION_START,
      endAt: SESSION_END,
      deltaSocPercent: 35,
      energyAddedKwh: 18,
      isOngoing: false,
      idempotencyKey: `fb-${suffix}`,
      metadata: { qualityStatus: 'QUALIFIED' },
      ...overrides,
    },
  });
}

async function createLegacyRechargeVee(
  prisma: PrismaClient,
  vehicleId: string,
  dimoSegmentId: string,
  overrides: Record<string, unknown> = {},
) {
  const durationSeconds = Math.floor(
    (SESSION_END.getTime() - SESSION_START.getTime()) / 1000,
  );
  return prisma.vehicleEnergyEvent.create({
    data: {
      vehicleId,
      dimoSegmentId,
      kind: EnergyEventKind.RECHARGE,
      detectionMechanism: 'recharge',
      detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
      canonicalChargeSessionId: null,
      startTime: SESSION_START,
      endTime: SESSION_END,
      durationSeconds,
      socDeltaPercent: 40,
      energyDeltaKwh: 22,
      confidence: EnergyEventConfidence.HIGH,
      ...overrides,
    },
  });
}

async function countShadowRows(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.erdRechargeProjectionShadowObservation.count({ where: { vehicleId } });
}

async function countVee(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({ where: { vehicleId } });
}

async function countHvSessions(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.hvChargeSession.count({ where: { vehicleId } });
}

async function countRefuelVee(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({
    where: { vehicleId, kind: EnergyEventKind.REFUEL },
  });
}

async function loadCohortCounts(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
) {
  const sessions = await prisma.hvChargeSession.findMany({
    where: { vehicleId, organizationId },
  });
  const legacyRows = await prisma.vehicleEnergyEvent.findMany({
    where: buildLegacyDirectDimoRechargeWhere({
      vehicleId,
      windowFrom: WINDOW_FROM,
      windowTo: WINDOW_TO,
    }),
  });
  const canonicalEpisodeCount = buildCanonicalShadowCandidates({
    sessions,
    organizationId,
    vehicleId,
    windowFrom: WINDOW_FROM,
    windowTo: WINDOW_TO,
  }).length;
  const legacyEpisodeCount = legacyRows.filter((row) =>
    isLegacyDirectDimoRechargeRow(row),
  ).length;
  return { canonicalEpisodeCount, legacyEpisodeCount, sessions, legacyRows };
}

const describeFn = LIVE ? describe : describe.skip;

describeFn(
  'ERD E5.4 recharge shadow parity PostgreSQL gate (ERD_E5_4_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let dbReady = false;

    beforeAll(async () => {
      dbReady = await probeDatabase();
      if (REQUIRED && !dbReady) {
        throw new Error('ERD_E5_4_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
      }
      if (!dbReady) return;
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('S2: coalesced lineage pairing → LEGACY_COALESCED_LINEAGE + EXACT_MATCH', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(
          prisma,
          vehicle.id,
          `dimo-recharge-coalesced-${suffix}`,
          {
            rawDetectionMeta: {
              coalescedFromSegmentIds: [session.dimoSegmentId!],
            },
          },
        );

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.pairingEvidence).toBe(
          ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.LEGACY_COALESCED_LINEAGE,
        );
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S1: exact DIMO id pairing → EXACT_MATCH persisted', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        );
        expect(out.observations[0]!.pairingEvidence).toBe(
          ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
        );
        expect(await countShadowRows(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('R1: NULL detectionSource legacy row returned by Prisma cohort query and pairs EXACT_NATIVE_DIMO_ID', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const legacy = await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          detectionSource: null,
        });

        const legacyRows = await prisma.vehicleEnergyEvent.findMany({
          where: buildLegacyDirectDimoRechargeWhere({
            vehicleId: vehicle.id,
            windowFrom: WINDOW_FROM,
            windowTo: WINDOW_TO,
          }),
        });

        expect(legacyRows).toHaveLength(1);
        expect(legacyRows[0]!.id).toBe(legacy.id);
        expect(isLegacyDirectDimoRechargeRow(legacyRows[0]!)).toBe(true);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: false,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.pairingEvidence).toBe(
          ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
        );
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('R2: SYNQDRIVE_ERD_RECHARGE_PROJECTION rows excluded from legacy cohort query', async () => {
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
            detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            canonicalChargeSessionId: session.id,
            sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
            startTime: SESSION_START,
            endTime: SESSION_END,
            durationSeconds: 3600,
            socDeltaPercent: 40,
            energyDeltaKwh: 22,
            confidence: EnergyEventConfidence.MEDIUM,
          },
        });

        const legacyRows = await prisma.vehicleEnergyEvent.findMany({
          where: buildLegacyDirectDimoRechargeWhere({
            vehicleId: vehicle.id,
            windowFrom: WINDOW_FROM,
            windowTo: WINDOW_TO,
          }),
        });

        expect(legacyRows).toHaveLength(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('R3: non-whitelist detectionSource excluded (pure predicate; RAW_FUEL_FALLBACK not seedable on RECHARGE)', async () => {
      if (!dbReady) return;
      expect(
        isLegacyDirectDimoRechargeRow({
          kind: EnergyEventKind.RECHARGE,
          detectionMechanism: 'recharge',
          canonicalChargeSessionId: null,
          dimoSegmentId: 'dimo-segment',
          detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_RAW_FUEL_FALLBACK,
        }),
      ).toBe(false);
      expect(
        isLegacyDirectDimoRechargeRow({
          kind: EnergyEventKind.RECHARGE,
          detectionMechanism: 'recharge',
          canonicalChargeSessionId: null,
          dimoSegmentId: 'dimo-segment',
          detectionSource:
            VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        }),
      ).toBe(false);
    });

    it('R4: pure predicate and Prisma cohort query agree on whitelist semantics', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const nullLegacy = await createLegacyRechargeVee(
          prisma,
          vehicle.id,
          session.dimoSegmentId!,
          { detectionSource: null },
        );
        const dimoNativeLegacy = await createLegacyRechargeVee(
          prisma,
          vehicle.id,
          `dimo-native-other-${suffix}`,
        );
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            dimoSegmentId: `refuel-${suffix}`,
            kind: EnergyEventKind.REFUEL,
            detectionMechanism: 'refuel',
            detectionSource: null,
            canonicalChargeSessionId: null,
            startTime: SESSION_START,
            endTime: SESSION_END,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.HIGH,
          },
        });

        const legacyRows = await prisma.vehicleEnergyEvent.findMany({
          where: buildLegacyDirectDimoRechargeWhere({
            vehicleId: vehicle.id,
            windowFrom: WINDOW_FROM,
            windowTo: WINDOW_TO,
          }),
        });

        expect(legacyRows.map((r) => r.id).sort()).toEqual(
          [nullLegacy.id, dimoNativeLegacy.id].sort(),
        );
        for (const row of legacyRows) {
          expect(isLegacyDirectDimoRechargeRow(row)).toBe(true);
        }
        const allVehicleRows = await prisma.vehicleEnergyEvent.findMany({
          where: { vehicleId: vehicle.id },
        });
        for (const row of allVehicleRows) {
          const inCohort = legacyRows.some((l) => l.id === row.id);
          expect(isLegacyDirectDimoRechargeRow(row)).toBe(inCohort);
        }
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S5: fallback-only canonical → PENDING_SETTLEMENT', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createFallbackSession(prisma, org.id, vehicle.id, suffix);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.PENDING_SETTLEMENT,
        );
        expect(out.observations[0]!.finality).toBe(
          ERD_RECHARGE_SHADOW_FINALITY.PENDING_SETTLEMENT,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S7: legacy-only recharge VEE → SETTLED LEGACY_ONLY', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createLegacyRechargeVee(prisma, vehicle.id, `legacy-only-${suffix}`);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY,
        );
        expect(out.observations[0]!.finality).toBe(ERD_RECHARGE_SHADOW_FINALITY.SETTLED);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S6: native canonical without legacy → SETTLED CANONICAL_ONLY', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createNativeSession(prisma, org.id, vehicle.id, suffix);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations).toHaveLength(1);
        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY,
        );
        expect(out.observations[0]!.finality).toBe(ERD_RECHARGE_SHADOW_FINALITY.SETTLED);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S9: multiple legacy rows overlapping one canonical → MULTIPLE_LEGACY_ONE_CANONICAL', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, `legacy-a-${suffix}`, {
          startTime: SESSION_START,
          endTime: SESSION_END,
        });
        await createLegacyRechargeVee(prisma, vehicle.id, `legacy-b-${suffix}`, {
          startTime: SESSION_START,
          endTime: SESSION_END,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        const multiLegacy = out.observations.filter(
          (o) =>
            o.parityClass ===
            ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
        );
        expect(multiLegacy).toHaveLength(1);
        expect(multiLegacy[0]!.canonicalChargeSessionId).toBe(session.id);
        expect(
          multiLegacy[0]!.fieldDiff?.relatedLegacyVehicleEnergyEventIds?.length,
        ).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S8: legacy row overlapping multiple canonical → LEGACY_COALESCED_MULTIPLE_CANONICAL', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-a`, {
          startAt: new Date('2026-06-01T10:00:00.000Z'),
          endAt: new Date('2026-06-01T10:45:00.000Z'),
          dimoSegmentId: `dimo-a-${suffix}`,
          segmentFingerprint: `fp-a-${suffix}`,
          idempotencyKey: `native-a-${suffix}`,
        });
        await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-b`, {
          startAt: new Date('2026-06-01T10:30:00.000Z'),
          endAt: new Date('2026-06-01T11:30:00.000Z'),
          dimoSegmentId: `dimo-b-${suffix}`,
          segmentFingerprint: `fp-b-${suffix}`,
          idempotencyKey: `native-b-${suffix}`,
        });
        await createLegacyRechargeVee(prisma, vehicle.id, `legacy-span-${suffix}`, {
          startTime: new Date('2026-06-01T10:00:00.000Z'),
          endTime: new Date('2026-06-01T11:30:00.000Z'),
          durationSeconds: 5400,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        const legacyCoalesced = out.observations.filter(
          (o) =>
            o.parityClass ===
            ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_COALESCED_MULTIPLE_CANONICAL,
        );
        expect(legacyCoalesced).toHaveLength(1);
        expect(legacyCoalesced[0]!.fieldDiff?.relatedCanonicalSessionIds?.length).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S10: paired episodes with equal material fields → EXACT_MATCH', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: false,
        });

        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        );
        expect(out.observations[0]!.fieldDiff?.mismatches ?? []).toHaveLength(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S12: SOC mismatch → numeric soc delta recorded', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          deltaSocPercent: 50,
        });
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          socDeltaPercent: 10,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: false,
        });

        const paired = out.observations[0]!;
        expect(paired.parityClass).toBe(ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH);
        expect(paired.fieldDiff?.numericDeltas.socDeltaDifferencePercent).toBe(40);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S13: energy mismatch → numeric energy delta recorded', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          energyAddedKwh: 30,
        });
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          energyDeltaKwh: 5,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: false,
        });

        expect(out.observations[0]!.fieldDiff?.numericDeltas.energyDeltaDifferenceKwh).toBe(
          25,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S11: time boundary delta beyond tolerance → FIELD_MISMATCH with numeric deltas', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          startTime: new Date('2026-06-01T10:00:05.000Z'),
          endTime: SESSION_END,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        const paired = out.observations.find(
          (o) => o.canonicalChargeSessionId != null && o.legacyVehicleEnergyEventId != null,
        );
        expect(paired!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH,
        );
        expect(paired!.fieldDiff?.numericDeltas.startDeltaSeconds).toBe(-5);
        expect(paired!.fieldDiff?.mismatches.some((m) => m.field === 'startTime')).toBe(
          true,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S14: legacy coordinates without canonical coords → EXPECTED_BY_DESIGN semantic match', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          startLatitude: 52.52,
          startLongitude: 13.405,
          endLatitude: 52.521,
          endLongitude: 13.406,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.observations[0]!.parityClass).toBe(
          ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH,
        );
        const coordMismatch = out.observations[0]!.fieldDiff?.mismatches.find(
          (m) => m.field === 'coordinates',
        );
        expect(coordMismatch?.severity).toBe(
          ERD_RECHARGE_SHADOW_FIELD_SEVERITY.EXPECTED_BY_DESIGN,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S16: E3 DIFFERENT native episodes remain independent canonical-only rows', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-morning`, {
          startAt: new Date('2026-06-01T08:00:00.000Z'),
          endAt: new Date('2026-06-01T09:00:00.000Z'),
          dimoSegmentId: `dimo-morning-${suffix}`,
          segmentFingerprint: `fp-morning-${suffix}`,
          idempotencyKey: `native-morning-${suffix}`,
        });
        await createNativeSession(prisma, org.id, vehicle.id, `${suffix}-evening`, {
          startAt: new Date('2026-06-01T18:00:00.000Z'),
          endAt: new Date('2026-06-01T19:00:00.000Z'),
          dimoSegmentId: `dimo-evening-${suffix}`,
          segmentFingerprint: `fp-evening-${suffix}`,
          idempotencyKey: `native-evening-${suffix}`,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        const canonicalOnly = out.observations.filter(
          (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY,
        );
        expect(canonicalOnly).toHaveLength(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S15: superseded fallback excluded from canonical cohort (only native N counted)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const nativeFp = `dimo-recharge-native-${suffix}`;
        await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-fb`, {
          metadata: {
            qualityStatus: 'QUALIFIED',
            supersededBySegmentFingerprint: nativeFp,
          },
        });
        await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          segmentFingerprint: nativeFp,
        });

        const cohort = await loadCohortCounts(prisma, org.id, vehicle.id);
        expect(cohort.canonicalEpisodeCount).toBe(1);

        const pure = evaluateRechargeShadowParity({
          organizationId: org.id,
          vehicleId: vehicle.id,
          windowFrom: WINDOW_FROM,
          windowTo: WINDOW_TO,
          sessions: cohort.sessions,
          legacyRows: cohort.legacyRows,
        });
        const canonicalOnly = pure.filter(
          (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY,
        );
        expect(canonicalOnly).toHaveLength(1);
        expect(canonicalOnly[0]!.canonicalChargeSessionId).toBeTruthy();
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S17: repeat evaluate with persist dedupes shadow rows (single fingerprint)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        const input = { ...evaluateInput(org.id, vehicle.id), persist: true };

        const first = await service.evaluateVehicleWindow(input);
        const second = await service.evaluateVehicleWindow(input);

        expect(first.persistence.created).toBe(1);
        expect(second.persistence.deduped).toBeGreaterThanOrEqual(1);
        expect(await countShadowRows(prisma, vehicle.id)).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S18: session soc change updates shadow evidence (fingerprint changes)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const legacy = await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        const input = { ...evaluateInput(org.id, vehicle.id), persist: true };

        const first = await service.evaluateVehicleWindow(input);
        const fingerprintBefore = first.observations[0]!.comparisonFingerprint;

        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: { deltaSocPercent: 10 },
        });
        await prisma.vehicleEnergyEvent.update({
          where: { id: legacy.id },
          data: { socDeltaPercent: 10, confidence: EnergyEventConfidence.MEDIUM },
        });

        const second = await service.evaluateVehicleWindow(input);
        const fingerprintAfter = second.observations.find(
          (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        )!.comparisonFingerprint;

        expect(fingerprintAfter).not.toBe(fingerprintBefore);
        expect(second.persistence.created + second.persistence.updated).toBeGreaterThanOrEqual(1);
        expect(await countShadowRows(prisma, vehicle.id)).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S22: legacy DIMO recharge cohort predicate stable after shadow evaluation', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        const legacy = await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        const cohortBefore = await loadCohortCounts(prisma, org.id, vehicle.id);
        expect(cohortBefore.legacyEpisodeCount).toBe(1);
        expect(isLegacyDirectDimoRechargeRow(legacy)).toBe(true);

        await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        const cohortAfter = await loadCohortCounts(prisma, org.id, vehicle.id);
        expect(cohortAfter.legacyEpisodeCount).toBe(1);
        const legacyAfter = await prisma.vehicleEnergyEvent.findUnique({
          where: { id: legacy.id },
        });
        expect(isLegacyDirectDimoRechargeRow(legacyAfter!)).toBe(true);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S19–S21: shadow evaluate persist:true does not mutate VEE, HV, or REFUEL counts', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.REFUEL,
            detectionMechanism: 'refuel',
            dimoSegmentId: `refuel-${suffix}`,
            startTime: SESSION_START,
            endTime: SESSION_END,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.MEDIUM,
          },
        });
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.RECHARGE,
            detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
            detectionSource:
              VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            dimoSegmentId: null,
            canonicalChargeSessionId: session.id,
            sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
            startTime: SESSION_START,
            endTime: SESSION_END,
            durationSeconds: 3600,
            confidence: EnergyEventConfidence.HIGH,
            rawDetectionMeta: {
              anchorSegmentFingerprint: session.segmentFingerprint,
              projectionVersion: 1,
            },
          },
        });

        const veeBefore = await countVee(prisma, vehicle.id);
        const hvBefore = await countHvSessions(prisma, vehicle.id);
        const refuelBefore = await countRefuelVee(prisma, vehicle.id);

        await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(await countVee(prisma, vehicle.id)).toBe(veeBefore);
        expect(await countHvSessions(prisma, vehicle.id)).toBe(hvBefore);
        expect(await countRefuelVee(prisma, vehicle.id)).toBe(refuelBefore);
        expect(await countShadowRows(prisma, vehicle.id)).toBeGreaterThan(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S23: shadow evaluate never calls projectCanonicalRecharge', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      const projector = await import(
        '../erd-recharge-projection/erd-canonical-recharge-projector'
      );
      const spy = jest.spyOn(projector, 'projectCanonicalRecharge');
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);

        await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S24: persist:false → zero shadow rows persisted', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: false,
        });

        expect(out.result).toBe(ERD_RECHARGE_SHADOW_RUN_RESULT.SKIPPED_FLAG_OFF);
        expect(out.observations.length).toBeGreaterThan(0);
        expect(await countShadowRows(prisma, vehicle.id)).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S25: runAfterEnergyDetectionSafe swallows injectPersistenceFailure (no throw)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      const runtime = new ErdRechargeShadowParityRuntimeService(service);
      const previousFlag = process.env.ERD_RECHARGE_SHADOW_PARITY_ENABLED;
      process.env.ERD_RECHARGE_SHADOW_PARITY_ENABLED = '1';
      const realEvaluate = service.evaluateVehicleWindow.bind(service);
      jest.spyOn(service, 'evaluateVehicleWindow').mockImplementation((input) =>
        realEvaluate({ ...input, injectPersistenceFailure: true }),
      );
      try {
        await createNativeSession(prisma, org.id, vehicle.id, suffix);

        expect(() =>
          runtime.runAfterEnergyDetectionSafe({
            organizationId: org.id,
            vehicleId: vehicle.id,
            windowFrom: WINDOW_FROM,
            windowTo: WINDOW_TO,
          }),
        ).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 100));
      } finally {
        jest.restoreAllMocks();
        if (previousFlag === undefined) {
          delete process.env.ERD_RECHARGE_SHADOW_PARITY_ENABLED;
        } else {
          process.env.ERD_RECHARGE_SHADOW_PARITY_ENABLED = previousFlag;
        }
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S26: parallel Prisma clients upsert same evaluation → single fingerprint row', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const clientA = new PrismaClient();
      const clientB = new PrismaClient();
      const serviceA = buildShadowParityService(clientA);
      const serviceB = buildShadowParityService(clientB);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        const input = { ...evaluateInput(org.id, vehicle.id), persist: true };

        await Promise.all([
          serviceA.evaluateVehicleWindow(input),
          serviceB.evaluateVehicleWindow(input),
        ]);

        expect(await countShadowRows(prisma, vehicle.id)).toBe(1);
      } finally {
        await clientA.$disconnect().catch(() => undefined);
        await clientB.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S27: aggregator settled parity excludes pending settlement observations', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-pending`);
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix, {
          startAt: new Date('2026-06-01T14:00:00.000Z'),
          endAt: new Date('2026-06-01T15:00:00.000Z'),
        });
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!, {
          startTime: new Date('2026-06-01T14:00:00.000Z'),
          endTime: new Date('2026-06-01T15:00:00.000Z'),
          durationSeconds: 3600,
        });

        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.report.pendingSettlementCount).toBe(1);
        expect(out.report.pairedExactCount).toBe(1);
        expect(out.report.settledParityDenominator).toBe(1);
        expect(out.report.settledParityNumerator).toBe(1);
        expect(out.report.settledParityRate).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('S28: report canonical/legacy episode counts match DB cohort loaders', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const service = buildShadowParityService(prisma);
      try {
        const session = await createNativeSession(prisma, org.id, vehicle.id, suffix);
        await createLegacyRechargeVee(prisma, vehicle.id, session.dimoSegmentId!);
        await createFallbackSession(prisma, org.id, vehicle.id, `${suffix}-fb`);

        const cohort = await loadCohortCounts(prisma, org.id, vehicle.id);
        const out = await service.evaluateVehicleWindow({
          ...evaluateInput(org.id, vehicle.id),
          persist: true,
        });

        expect(out.report.canonicalEpisodeCount).toBe(cohort.canonicalEpisodeCount);
        expect(out.report.legacyEpisodeCount).toBe(cohort.legacyEpisodeCount);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
