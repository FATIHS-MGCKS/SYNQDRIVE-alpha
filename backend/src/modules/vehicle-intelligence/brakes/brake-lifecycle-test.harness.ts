import { RentalHealthService } from '../../rental-health/rental-health.service';
import { BrakeEvidenceService } from './brake-evidence.service';
import { BrakeHealthService } from './brake-health.service';
import { BrakeLifecycleService } from './brake-lifecycle.service';
import {
  applyNewBrakeDefaults,
  hasRegistrationBrakeSpecValues,
  normalizeRegistrationBrakeCondition,
  type RegistrationBrakeManualSpec,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';

export type InMemoryStore = {
  vehicles: Map<string, Record<string, unknown>>;
  brakeHealthCurrent: Map<string, Record<string, unknown>>;
  vehicleBrakeReferenceSpec: Array<Record<string, unknown>>;
  vehicleServiceEvent: Array<Record<string, unknown>>;
  brakeEvidence: Array<Record<string, unknown>>;
  vehicleLatestState: Map<string, Record<string, unknown>>;
  tripDrivingImpact: Array<Record<string, unknown>>;
};

export function createInMemoryPrisma(store: InMemoryStore) {
  let eventSeq = 0;
  let evidenceSeq = 0;
  let specSeq = 0;

  return {
    vehicle: {
      findUnique: jest.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const row = store.vehicles.get(where.id);
        if (!row) return null;
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = row[key];
        }
        return out;
      }),
    },
    vehicleLatestState: {
      findUnique: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { vehicleId: string };
          select?: Record<string, boolean>;
        }) => {
          const row = store.vehicleLatestState.get(where.vehicleId);
          if (!row) return null;
          if (!select) return row;
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) out[key] = row[key];
          }
          return out;
        },
      ),
    },
    vehicleBrakeReferenceSpec: {
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { vehicleId: string };
          orderBy?: { createdAt?: 'desc' | 'asc' };
          take?: number;
        }) => {
          let rows = store.vehicleBrakeReferenceSpec.filter((r) => r.vehicleId === where.vehicleId);
          if (orderBy?.createdAt === 'desc') {
            rows = [...rows].sort(
              (a, b) =>
                new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime(),
            );
          }
          if (typeof take === 'number') rows = rows.slice(0, take);
          return rows;
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `spec-${++specSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.vehicleBrakeReferenceSpec.push(row);
        return row;
      }),
    },
    brakeHealthCurrent: {
      findUnique: jest.fn(async ({ where }: { where: { vehicleId: string } }) =>
        store.brakeHealthCurrent.get(where.vehicleId) ?? null,
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { vehicleId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = store.brakeHealthCurrent.get(where.vehicleId);
          if (existing) {
            const merged = { ...existing, ...update, updatedAt: new Date() };
            store.brakeHealthCurrent.set(where.vehicleId, merged);
            return merged;
          }
          const row = {
            id: `bhc-${where.vehicleId}`,
            frontPadKFactor: 1.0,
            rearPadKFactor: 1.0,
            frontDiscKFactor: 1.0,
            rearDiscKFactor: 1.0,
            ...create,
            updatedAt: new Date(),
          };
          store.brakeHealthCurrent.set(where.vehicleId, row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { vehicleId: string };
          data: Record<string, unknown>;
        }) => {
          const existing = store.brakeHealthCurrent.get(where.vehicleId);
          if (!existing) throw new Error('brakeHealthCurrent not found');
          const merged = { ...existing, ...data, updatedAt: new Date() };
          store.brakeHealthCurrent.set(where.vehicleId, merged);
          return merged;
        },
      ),
    },
    vehicleServiceEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `evt-${++eventSeq}`, ...data };
        store.vehicleServiceEvent.push(row);
        return row;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = store.vehicleServiceEvent.findIndex((e) => e.id === where.id);
          if (idx < 0) throw new Error('service event not found');
          store.vehicleServiceEvent[idx] = { ...store.vehicleServiceEvent[idx], ...data };
          return store.vehicleServiceEvent[idx];
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
          select,
        }: {
          where: { vehicleId: string; eventType: string };
          orderBy?: { eventDate?: 'desc' | 'asc' };
          select?: Record<string, boolean>;
        }) => {
          let rows = store.vehicleServiceEvent.filter(
            (e) => e.vehicleId === where.vehicleId && e.eventType === where.eventType,
          );
          if (orderBy?.eventDate === 'desc') {
            rows = [...rows].sort(
              (a, b) =>
                new Date(String(b.eventDate)).getTime() - new Date(String(a.eventDate)).getTime(),
            );
          }
          const row = rows[0] ?? null;
          if (!row || !select) return row;
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) out[key] = row[key];
          }
          return out;
        },
      ),
      findMany: jest.fn(async ({ where }: { where: { vehicleId: string; eventType: string } }) =>
        store.vehicleServiceEvent.filter(
          (e) => e.vehicleId === where.vehicleId && e.eventType === where.eventType,
        ),
      ),
    },
    brakeEvidence: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ev-${++evidenceSeq}`, createdAt: new Date(), ...data };
        store.brakeEvidence.push(row);
        return row;
      }),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) {
          store.brakeEvidence.push({ id: `ev-${++evidenceSeq}`, createdAt: new Date(), ...item });
        }
        return { count: data.length };
      }),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { vehicleId: string };
          orderBy?: Record<string, unknown>;
          take?: number;
        }) => {
          let rows = store.brakeEvidence.filter((e) => e.vehicleId === where.vehicleId);
          if (orderBy) {
            rows = [...rows].sort((a, b) => {
              const aT = new Date(String(a.measuredAt ?? a.createdAt)).getTime();
              const bT = new Date(String(b.measuredAt ?? b.createdAt)).getTime();
              return bT - aT;
            });
          }
          if (typeof take === 'number') rows = rows.slice(0, take);
          return rows;
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: {
            vehicleId: string;
            source?: { in: string[] };
            OR?: Array<Record<string, unknown>>;
          };
          orderBy?: Record<string, unknown>;
        }) => {
          let rows = store.brakeEvidence.filter((e) => e.vehicleId === where.vehicleId);
          if (where.source?.in) {
            rows = rows.filter((e) => where.source!.in.includes(String(e.source)));
          }
          if (where.OR) {
            rows = rows.filter((e) =>
              where.OR!.some((clause) => {
                if (clause.measuredPadMm && (clause.measuredPadMm as { not: null }).not === null) {
                  return e.measuredPadMm != null;
                }
                if (
                  clause.measuredDiscMm &&
                  (clause.measuredDiscMm as { not: null }).not === null
                ) {
                  return e.measuredDiscMm != null;
                }
                if (clause.immediateReplacement === true) return e.immediateReplacement === true;
                return false;
              }),
            );
          }
          if (orderBy) {
            rows = [...rows].sort((a, b) => {
              const aT = new Date(String(a.measuredAt ?? a.createdAt)).getTime();
              const bT = new Date(String(b.measuredAt ?? b.createdAt)).getTime();
              return bT - aT;
            });
          }
          return rows[0] ?? null;
        },
      ),
    },
    tripDrivingImpact: {
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          select,
        }: {
          where: {
            vehicleId: string;
            tripStartedAt?: { gte: Date };
          };
          orderBy?: { tripStartedAt?: 'asc' | 'desc' };
          select?: Record<string, boolean>;
        }) => {
          let rows = store.tripDrivingImpact.filter((t) => t.vehicleId === where.vehicleId);
          if (where.tripStartedAt?.gte) {
            const gteMs = where.tripStartedAt.gte.getTime();
            rows = rows.filter(
              (t) => new Date(String(t.tripStartedAt)).getTime() >= gteMs,
            );
          }
          if (orderBy?.tripStartedAt === 'asc') {
            rows = [...rows].sort(
              (a, b) =>
                new Date(String(a.tripStartedAt)).getTime() -
                new Date(String(b.tripStartedAt)).getTime(),
            );
          }
          if (!select) return rows;
          return rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              if (select[key]) out[key] = row[key];
            }
            return out;
          });
        },
      ),
    },
  };
}

export type BrakeLifecycleHarness = ReturnType<typeof createBrakeLifecycleHarness>;

export function createBrakeLifecycleHarness(input?: {
  registrationMileageKm?: number | null;
  latestStateOdometerKm?: number | null;
  vehicleId?: string;
}) {
  const vehicleId = input?.vehicleId ?? 'veh-lifecycle-1';
  const store: InMemoryStore = {
    vehicles: new Map([
      [
        vehicleId,
        {
          id: vehicleId,
          organizationId: 'org-1',
          fuelType: 'GASOLINE',
          brakeForceFrontPercent: null,
          mileageKm: input?.registrationMileageKm ?? null,
        },
      ],
    ]),
    brakeHealthCurrent: new Map(),
    vehicleBrakeReferenceSpec: [],
    vehicleServiceEvent: [],
    brakeEvidence: [],
    vehicleLatestState: new Map(
      input?.latestStateOdometerKm != null
        ? [[vehicleId, { vehicleId, odometerKm: input.latestStateOdometerKm }]]
        : [],
    ),
    tripDrivingImpact: [],
  };

  const prisma = createInMemoryPrisma(store);
  const defaultRollingImpact = {
    citySharePct: 40,
    highwaySharePct: 40,
    countryRoadSharePct: 20,
    hardBrakePer100Km: 3,
    fullBrakingPer100Km: 0.5,
    stopDensity: 1.0,
    highSpeedBrakeShare: 0.1,
    thermalBrakeStressScore: 30,
    brakingStressScore: 50,
  };
  const drivingImpact = {
    getVehicleImpactForBrake: jest.fn().mockResolvedValue(defaultRollingImpact),
  };
  const brakeEvidence = new BrakeEvidenceService(prisma as never);
  const brakeHealth = new BrakeHealthService(prisma as never, drivingImpact as never, brakeEvidence);
  const lifecycle = new BrakeLifecycleService(prisma as never, brakeHealth, brakeEvidence);

  const rentalHealth = new RentalHealthService(
    prisma as never,
    { getSummary: jest.fn() } as never,
    { getSummary: jest.fn() } as never,
    brakeHealth,
    { getSummary: jest.fn() } as never,
    { getAiHealthCareSignals: jest.fn() } as never,
    { evaluateCompliance: jest.fn(), toRentalModuleHealth: jest.fn() } as never,
    { getActiveOverride: jest.fn().mockResolvedValue(null) } as never,
  );

  const evaluateBrakes = (summary: Awaited<ReturnType<BrakeHealthService['getSummary']>>) =>
    (
      rentalHealth as unknown as {
        evaluateBrakes: (s: Awaited<ReturnType<BrakeHealthService['getSummary']>>) => unknown;
      }
    ).evaluateBrakes(summary);

  const collectBlockingReasons = (
    modules: Record<string, unknown>,
    brakeSummary: Awaited<ReturnType<BrakeHealthService['getSummary']>> | null,
  ) =>
  (
    rentalHealth as unknown as {
      collectBlockingReasons: (
        m: Record<string, unknown>,
        complaints: unknown[],
        hmAi: null,
        compliance: { tuvBokraft: { tuvOverdue: boolean; bokraftOverdue: boolean } },
        dtc: null,
        brake: typeof brakeSummary,
      ) => string[];
    }
  ).collectBlockingReasons(
    modules,
    [],
    null,
    { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
    null,
    brakeSummary,
  );

  async function simulateRegisterFromDimoBrakes(rawBrakes: RegistrationBrakeManualSpec) {
    const condition = normalizeRegistrationBrakeCondition(rawBrakes.condition);
    const brakesForSpec = applyNewBrakeDefaults(rawBrakes, condition);
    const shouldCreateSpec = condition === 'NEW' || hasRegistrationBrakeSpecValues(brakesForSpec);

    if (shouldCreateSpec) {
      await prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId,
          frontRotorDiameter: brakesForSpec.frontRotorDiameter ?? null,
          frontRotorWidth: brakesForSpec.frontRotorWidth ?? null,
          frontPadThickness: brakesForSpec.frontPadThickness ?? null,
          rearRotorDiameter: brakesForSpec.rearRotorDiameter ?? null,
          rearRotorWidth: brakesForSpec.rearRotorWidth ?? null,
          rearPadThickness: brakesForSpec.rearPadThickness ?? null,
          sourceType: rawBrakes.source?.trim() || 'manual_registration',
        },
      });
    }

    if (shouldInitializeBrakesFromRegistration(rawBrakes)) {
      const latestState = await prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true },
      });
      return lifecycle.initializeFromRegistration({
        vehicleId,
        brakes: rawBrakes,
        registrationMileageKm: store.vehicles.get(vehicleId)?.mileageKm as number | null,
        latestStateOdometerKm: (latestState as { odometerKm?: number } | null)?.odometerKm ?? null,
      });
    }
    return null;
  }

  return {
    store,
    prisma,
    brakeEvidence,
    brakeHealth,
    lifecycle,
    evaluateBrakes,
    collectBlockingReasons,
    vehicleId,
    simulateRegisterFromDimoBrakes,
  };
}

export type SeedMeasuredBaselineOptions = {
  serviceDate?: string;
  odometerKm?: number;
  frontPadMm?: number;
  rearPadMm?: number;
  frontDiscMm?: number;
  rearDiscMm?: number;
  kFactors?: {
    frontPad?: number;
    rearPad?: number;
    frontDisc?: number;
    rearDisc?: number;
  };
};

/** Seed a fully measured baseline via the canonical lifecycle write-path. */
export async function seedMeasuredBrakeBaseline(
  h: BrakeLifecycleHarness,
  opts: SeedMeasuredBaselineOptions = {},
) {
  const frontPadMm = opts.frontPadMm ?? 10;
  const rearPadMm = opts.rearPadMm ?? 9;
  const frontDiscMm = opts.frontDiscMm ?? 28;
  const rearDiscMm = opts.rearDiscMm ?? 26;
  const odometerKm = opts.odometerKm ?? 10000;

  await h.prisma.vehicleBrakeReferenceSpec.create({
    data: {
      vehicleId: h.vehicleId,
      frontPadThickness: frontPadMm,
      rearPadThickness: rearPadMm,
      frontRotorWidth: frontDiscMm,
      rearRotorWidth: rearDiscMm,
      sourceType: 'test_harness',
    },
  });

  await h.lifecycle.recordService({
    vehicleId: h.vehicleId,
    serviceDate: opts.serviceDate ?? '2026-01-15T10:00:00Z',
    odometerKm,
    kind: 'full_brake_service',
    measured: { frontPadMm, rearPadMm, frontDiscMm, rearDiscMm },
  });

  if (opts.kFactors) {
    const current = h.store.brakeHealthCurrent.get(h.vehicleId);
    if (current) {
      h.store.brakeHealthCurrent.set(h.vehicleId, {
        ...current,
        frontPadKFactor: opts.kFactors.frontPad ?? current.frontPadKFactor,
        rearPadKFactor: opts.kFactors.rearPad ?? current.rearPadKFactor,
        frontDiscKFactor: opts.kFactors.frontDisc ?? current.frontDiscKFactor,
        rearDiscKFactor: opts.kFactors.rearDisc ?? current.rearDiscKFactor,
      });
    }
  }

  if (!h.store.vehicleLatestState.has(h.vehicleId)) {
    h.store.vehicleLatestState.set(h.vehicleId, { vehicleId: h.vehicleId, odometerKm });
  }

  return h.store.brakeHealthCurrent.get(h.vehicleId)!;
}
