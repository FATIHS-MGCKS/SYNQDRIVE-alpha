import { randomUUID } from 'crypto';
import { PrismaClient, FuelType, type RawRefuelCandidate } from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import { EnergyEventsService } from '../energy-events.service';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_FUEL_REFUEL_F5_PR1_INTEGRATION === '1';

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

function setRfrfFlags(
  master: boolean,
  persist: boolean,
  convergence?: boolean,
): () => void {
  const prevMaster = process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
  const prevPersist = process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
  const prevConvergence = process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = master ? '1' : '0';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = persist ? '1' : '0';
  if (convergence !== undefined) {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = convergence ? 'true' : 'false';
  }
  return () => {
    if (prevMaster === undefined) delete process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = prevMaster;
    if (prevPersist === undefined) delete process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = prevPersist;
    if (convergence !== undefined) {
      if (prevConvergence === undefined) delete process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
      else process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = prevConvergence;
    }
  };
}

function mapSamples(
  samples: ReturnType<typeof stablePlateauSamples>,
): Array<{ timestamp: Date; absoluteLiters: number | null; relativePercent: number | null }> {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    absoluteLiters: s.absoluteLiters ?? null,
    relativePercent: s.relativePercent ?? null,
  }));
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string, tokenId = 920000 + Math.floor(Math.random() * 10000)) {
  const org = await prisma.organization.create({
    data: { companyName: `RFRF F5PR1 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-f5pr1-${suffix}`,
      tokenId,
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `F5${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `F5-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, tokenId, dimoVehicleId: dimoVehicle.id };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, orgId: string, dimoVehicleId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

async function countFallbackVee(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({
    where: { vehicleId, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
  });
}

async function countPromoted(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'PROMOTED' },
  });
}

async function countConvergedNative(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'CONVERGED_NATIVE' },
  });
}

function candidateMatcherWindow(candidate: RawRefuelCandidate): { start: Date; end: Date } {
  const start =
    candidate.riseOnsetAt ??
    candidate.physicalEvidenceStart ??
    candidate.firstObservedAt;
  const end =
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    (candidate.postFuelAbsoluteLiters != null || candidate.postFuelRelativePercent != null
      ? candidate.lastObservedAt
      : candidate.firstObservedAt);
  return { start, end };
}

function nativeSameSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string, detectionSource?: null | 'DIMO_NATIVE') {
  const { start, end } = candidateMatcherWindow(candidate);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-same-${suffix}`,
    ...(detectionSource === 'DIMO_NATIVE' ? { detectionSource: 'DIMO_NATIVE' as const } : {}),
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    fuelDeltaLiters: candidate.deltaAbsoluteLiters,
    rawDetectionMeta: {
      fuelStartLiters: candidate.preFuelAbsoluteLiters,
      fuelEndLiters: candidate.postFuelAbsoluteLiters,
    },
  };
}

function nativeInsufficientSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
  const { end } = candidateMatcherWindow(candidate);
  const start = new Date(end.getTime() - 7 * 60 * 1000);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-insuff-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    rawDetectionMeta: {},
  };
}

function nativeDistinctSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
  const { end } = candidateMatcherWindow(candidate);
  const start = new Date(end.getTime() + 2 * 60 * 60 * 1000);
  const distinctEnd = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-distinct-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: distinctEnd,
    durationSeconds: 1800,
    fuelDeltaLiters: 20,
    rawDetectionMeta: { fuelStartLiters: 20, fuelEndLiters: 40 },
  };
}

function syntheticRiseSamples() {
  return mapSamples([
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ]);
}

function buildRuntimeStack(prisma: PrismaClient, fetchFuelLevelSamples: jest.Mock) {
  const fetchFuelLevelSamplesWithOutcome = jest.fn(async (...args: unknown[]) => {
    try {
      const result = await fetchFuelLevelSamples(...args);
      if (result && typeof result === 'object' && 'status' in (result as Record<string, unknown>)) {
        return result;
      }
      return { status: 'SUCCESS', samples: result };
    } catch (error) {
      return {
        status: 'ERROR',
        samples: [],
        errorClass: 'PROVIDER_QUERY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const dimoSegments = {
    fetchFuelLevelSamples,
    fetchFuelLevelSamplesWithOutcome,
    fetchEnergyEventSegments: jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
  };
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-06T10:00:00.000Z',
  );
  const promotionPreparation = new RawRefuelPromotionPreparationService(
    prisma as unknown as PrismaService,
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const rawRuntime = new RawFuelRefuelFallbackRuntimeService(
    dimoSegments as never,
    candidateService,
    promotionPreparation,
    convergence,
  );
  const energyEvents = new EnergyEventsService(
    prisma as unknown as PrismaService,
    dimoSegments as never,
    undefined,
    undefined,
    undefined,
    rawRuntime,
  );
  return { energyEvents, convergence, candidateService };
}

async function persistReadyCandidate(
  prisma: PrismaClient,
  vehicleId: string,
  organizationId: string,
): Promise<RawRefuelCandidate> {
  const { energyEvents } = buildRuntimeStack(
    prisma,
    jest.fn().mockResolvedValue(syntheticRiseSamples()),
  );
  await energyEvents.detectEnergyEvents(vehicleId, {
    from: new Date('2026-09-06T07:00:00.000Z'),
    to: new Date('2026-09-06T12:00:00.000Z'),
  });
  const persisted = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId } });
  if (!persisted) throw new Error('expected candidate');
  void organizationId;
  return persisted;
}

const convergenceContext = {
  capability: 'FUEL_CAPABLE' as const,
  absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
  absoluteSignalTrust: 'TRUSTED' as const,
};

(LIVE ? describe : describe.skip)(
  'RFRF F5-PR1 authoritative convergence (RAW_FUEL_REFUEL_F5_PR1_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_F5_PR1_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('T4 — native SAME before promotion => CONVERGED_NATIVE, zero fallback VEE', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const native = await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('CONVERGED_NATIVE');
        expect(result.convergedNativeEventId).toBe(native.id);
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(1);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('T6 — native INSUFFICIENT => fail closed, not CONVERGED_NATIVE', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('T8 — SAME + INSUFFICIENT => fail closed', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        await prisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('T9 — SAME + DISTINCT => fail closed', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        await prisma.vehicleEnergyEvent.create({
          data: nativeDistinctSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(result.evaluation?.classification).toBe('AMBIGUOUS');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('T10 — multiple SAME => fail closed', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, `${suffix}-a`),
        });
        await prisma.vehicleEnergyEvent.create({
          data: {
            ...nativeSameSiblingFromCandidate(candidate, `${suffix}-b`),
            dimoSegmentId: `dimo-same-b-${suffix}`,
          },
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('no native siblings => candidate stays READY_FOR_PERSIST', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('SKIPPED_NO_ACTION');
        expect(result.evaluation?.classification).toBe('NO_NATIVE_SIBLINGS');
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('all DISTINCT natives => no convergence', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeDistinctSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('SKIPPED_NO_ACTION');
        expect(result.evaluation?.classification).toBe('DISTINCT_FROM_NATIVE');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('replay => idempotent CONVERGED_NATIVE', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const first = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        const second = await convergence.evaluateAndApplyConvergenceById(candidate.id, convergenceContext, process.env);
        expect(first.status).toBe('CONVERGED_NATIVE');
        expect(second.status).toBe('ALREADY_CONVERGED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('concurrent convergence => single terminal CONVERGED_NATIVE', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const [a, b] = await Promise.all([
          convergence.evaluateAndApplyConvergenceById(candidate.id, convergenceContext, process.env),
          convergence.evaluateAndApplyConvergenceById(candidate.id, convergenceContext, process.env),
        ]);
        const statuses = new Set([a.status, b.status]);
        expect(statuses.has('CONVERGED_NATIVE') || statuses.has('ALREADY_CONVERGED')).toBe(true);
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('foreign vehicle native rows are ignored', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const foreign = await seedOrgVehicle(prisma, `foreign-${suffix}`);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const foreignCandidate = await persistReadyCandidate(prisma, foreign.vehicle.id, foreign.org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(foreignCandidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.evaluation?.classification).toBe('NO_NATIVE_SIBLINGS');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
        await cleanup(prisma, foreign.vehicle.id, foreign.org.id, foreign.dimoVehicleId);
      }
    });

    it('legacy NULL-source native row is recognized', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix, null),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('CONVERGED_NATIVE');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('explicit DIMO_NATIVE row is recognized', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix, 'DIMO_NATIVE'),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('CONVERGED_NATIVE');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F5 authority flag false => no convergence mutation', async () => {
      const restore = setRfrfFlags(true, true, false);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('SKIPPED_NOT_AUTHORIZED');
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('malformed convergence flag => fail closed (no mutation)', async () => {
      const restoreMaster = setRfrfFlags(true, true);
      process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'maybe';
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('SKIPPED_NOT_AUTHORIZED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restoreMaster();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P1-A — >MAX authoritative native siblings fail closed with native_sibling_limit_exceeded', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const { start, end } = candidateMatcherWindow(candidate);
        for (let i = 0; i < 33; i += 1) {
          await prisma.vehicleEnergyEvent.create({
            data: {
              vehicleId: vehicle.id,
              dimoSegmentId: `dimo-overflow-${suffix}-${i}`,
              detectionSource: 'DIMO_NATIVE',
              kind: 'REFUEL',
              detectionMechanism: 'refuel',
              startTime: new Date(start.getTime() + i * 1000),
              endTime: end,
              durationSeconds: 60,
              rawDetectionMeta: {},
            },
          });
        }
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(result.detail).toBe('native_sibling_limit_exceeded');
        expect(result.evaluation?.detail).toBe('native_sibling_limit_exceeded');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P1-A — overflow replay remains fail-closed', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const { start, end } = candidateMatcherWindow(candidate);
        for (let i = 0; i < 33; i += 1) {
          await prisma.vehicleEnergyEvent.create({
            data: {
              vehicleId: vehicle.id,
              dimoSegmentId: `dimo-overflow-replay-${suffix}-${i}`,
              detectionSource: 'DIMO_NATIVE',
              kind: 'REFUEL',
              detectionMechanism: 'refuel',
              startTime: new Date(start.getTime() + i * 1000),
              endTime: end,
              durationSeconds: 60,
              rawDetectionMeta: {},
            },
          });
        }
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const first = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        const second = await convergence.evaluateAndApplyConvergenceById(
          candidate.id,
          convergenceContext,
          process.env,
        );
        expect(first.detail).toBe('native_sibling_limit_exceeded');
        expect(second.detail).toBe('native_sibling_limit_exceeded');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P1-A — non-authoritative fallback rows do not contribute to authoritative limit', async () => {
      const restore = setRfrfFlags(true, true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, org.id);
        const { start, end } = candidateMatcherWindow(candidate);
        for (let i = 0; i < 40; i += 1) {
          await prisma.vehicleEnergyEvent.create({
            data: {
              vehicleId: vehicle.id,
              dimoSegmentId: `dimo-fallback-noise-${suffix}-${i}`,
              detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
              sourceEventKey: `fallback-noise-${suffix}-${i}`,
              kind: 'REFUEL',
              detectionMechanism: 'refuel',
              startTime: new Date(start.getTime() + i * 1000),
              endTime: end,
              durationSeconds: 60,
              rawDetectionMeta: {},
            },
          });
        }
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { convergence } = buildRuntimeStack(prisma, jest.fn());
        const result = await convergence.evaluateAndApplyConvergence(candidate, convergenceContext, process.env);
        expect(result.status).toBe('CONVERGED_NATIVE');
        expect(result.detail).not.toBe('native_sibling_limit_exceeded');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P1-B — automatic runtime F4→F5 converges via detectEnergyEvents only', async () => {
      const restoreFlags = setRfrfFlags(true, true, false);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const { energyEvents } = buildRuntimeStack(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
        );
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const candidate = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(candidate).not.toBeNull();
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate!, suffix),
        });

        restoreFlags();
        const restoreConvergence = setRfrfFlags(true, true, true);
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });

        expect(detect.rawFuelFallback?.convergenceEvaluationAttempted).toBeGreaterThan(0);
        expect(detect.rawFuelFallback?.convergenceConvergedNative).toBeGreaterThan(0);
        const outcome = detect.rawFuelFallback?.candidateOutcomes.find((o) => o.candidateId === candidate!.id);
        expect(outcome?.convergenceApply?.status).toBe('CONVERGED_NATIVE');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(1);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        restoreConvergence();
      } finally {
        restoreFlags();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P1-B — automatic runtime fail-closed on SAME + INSUFFICIENT via detectEnergyEvents only', async () => {
      const restoreFlags = setRfrfFlags(true, true, false);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const { energyEvents } = buildRuntimeStack(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
        );
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const candidate = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(candidate).not.toBeNull();
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate!, suffix),
        });
        await prisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate!, suffix),
        });

        restoreFlags();
        const restoreConvergence = setRfrfFlags(true, true, true);
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });

        expect(detect.rawFuelFallback?.convergenceEvaluationAttempted).toBeGreaterThan(0);
        expect(detect.rawFuelFallback?.convergenceFailClosed).toBeGreaterThan(0);
        const outcome = detect.rawFuelFallback?.candidateOutcomes.find((o) => o.candidateId === candidate!.id);
        expect(outcome?.convergenceApply?.status).toBe('FAIL_CLOSED');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate!.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
        restoreConvergence();
      } finally {
        restoreFlags();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
