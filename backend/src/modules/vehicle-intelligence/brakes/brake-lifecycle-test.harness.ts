import { RentalHealthService } from '../../rental-health/rental-health.service';
import { BrakeEvidenceService } from './brake-evidence.service';
import { BrakeHealthService } from './brake-health.service';
import { BrakeLifecycleService } from './brake-lifecycle.service';
import { BrakeServiceApplicationService } from './brake-service-application.service';
import { BrakeServiceOutboxService } from './brake-service-outbox.service';
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
  brakeServiceApplications: Array<Record<string, unknown>>;
  brakeComponentInstallations: Array<Record<string, unknown>>;
  brakeServiceOutbox: Array<Record<string, unknown>>;
  vehicleLatestState: Map<string, Record<string, unknown>>;
  tripDrivingImpact: Array<Record<string, unknown>>;
};

export function createInMemoryPrisma(store: InMemoryStore) {
  let eventSeq = 0;
  let evidenceSeq = 0;
  let specSeq = 0;
  let applicationSeq = 0;
  let installationSeq = 0;
  let outboxSeq = 0;

  const api: any = {
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
      findFirst: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { id?: string; organizationId?: string };
          select?: Record<string, boolean>;
        }) => {
          let row: Record<string, unknown> | undefined;
          if (where.id) row = store.vehicles.get(where.id);
          if (!row) return null;
          if (where.organizationId && row.organizationId !== where.organizationId) return null;
          if (!select) return row;
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) out[key] = row![key];
          }
          return out;
        },
      ),
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
      }      ),
    },
    brakeRecalculationAudit: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `audit-${Date.now()}`,
        ...data,
      })),
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
    brakeServiceApplication: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) {
          return store.brakeServiceApplications.find((a) => a.id === where.id) ?? null;
        }
        const compound = where.organizationId_vehicleId_idempotencyKey as
          | { organizationId: string; vehicleId: string; idempotencyKey: string }
          | undefined;
        if (compound) {
          return (
            store.brakeServiceApplications.find(
              (a) =>
                a.organizationId === compound.organizationId &&
                a.vehicleId === compound.vehicleId &&
                a.idempotencyKey === compound.idempotencyKey,
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `app-${++applicationSeq}`, updatedAt: new Date(), ...data };
        store.brakeServiceApplications.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = store.brakeServiceApplications.findIndex((a) => a.id === where.id);
        if (idx < 0) throw new Error('application not found');
        store.brakeServiceApplications[idx] = {
          ...store.brakeServiceApplications[idx],
          ...data,
          updatedAt: new Date(),
        };
        return store.brakeServiceApplications[idx];
      }),
    },
    brakeComponentInstallation: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          store.brakeComponentInstallations.find((row) => {
            if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
            if (where.componentType && row.componentType !== where.componentType) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.removedAt === null && row.removedAt != null) return false;
            return true;
          }) ?? null
        );
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const active = store.brakeComponentInstallations.find(
          (row) =>
            row.vehicleId === data.vehicleId &&
            row.componentType === data.componentType &&
            row.status === 'ACTIVE' &&
            row.removedAt == null,
        );
        if (active) {
          const err = new Error('unique') as Error & { code?: string; meta?: { target?: string } };
          err.code = 'P2002';
          err.meta = { target: 'brake_component_installations_one_active_per_vehicle_component' };
          throw err;
        }
        const row = { id: `inst-${++installationSeq}`, updatedAt: new Date(), ...data };
        store.brakeComponentInstallations.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = store.brakeComponentInstallations.findIndex((row) => row.id === where.id);
        if (idx < 0) throw new Error('installation not found');
        store.brakeComponentInstallations[idx] = {
          ...store.brakeComponentInstallations[idx],
          ...data,
          updatedAt: new Date(),
        };
        return store.brakeComponentInstallations[idx];
      }),
    },
    brakeServiceOutbox: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `outbox-${++outboxSeq}`, updatedAt: new Date(), ...data };
        store.brakeServiceOutbox.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return store.brakeServiceOutbox.filter((row) => {
          if (where.applicationId && row.applicationId !== where.applicationId) return false;
          const statusFilter = where.status as { in?: string[] } | undefined;
          if (statusFilter?.in) {
            return statusFilter.in.includes(String(row.status));
          }
          return true;
        });
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        const statusFilter = where.status as { in?: string[] } | undefined;
        const attemptsInc = data.attempts as { increment?: number } | undefined;
        for (const row of store.brakeServiceOutbox) {
          if (where.id && row.id !== where.id) continue;
          if (statusFilter?.in && !statusFilter.in.includes(String(row.status))) continue;
          Object.assign(row, data);
          if (attemptsInc?.increment) {
            row.attempts = Number(row.attempts ?? 0) + attemptsInc.increment;
          }
          count += 1;
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = store.brakeServiceOutbox.findIndex((row) => row.id === where.id);
        if (idx < 0) throw new Error('outbox not found');
        store.brakeServiceOutbox[idx] = { ...store.brakeServiceOutbox[idx], ...data, updatedAt: new Date() };
        return store.brakeServiceOutbox[idx];
      }),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = {
        vehicleServiceEvent: [...store.vehicleServiceEvent],
        brakeHealthCurrent: new Map(store.brakeHealthCurrent),
        brakeEvidence: [...store.brakeEvidence],
        brakeComponentInstallations: [...store.brakeComponentInstallations],
        brakeServiceApplications: store.brakeServiceApplications.map((row) => ({ ...row })),
        brakeServiceOutbox: [...store.brakeServiceOutbox],
      };
      try {
        return await fn(api);
      } catch (error) {
        store.vehicleServiceEvent = snapshot.vehicleServiceEvent;
        store.brakeHealthCurrent = snapshot.brakeHealthCurrent;
        store.brakeEvidence = snapshot.brakeEvidence;
        store.brakeComponentInstallations = snapshot.brakeComponentInstallations;
        store.brakeServiceApplications = snapshot.brakeServiceApplications;
        store.brakeServiceOutbox = snapshot.brakeServiceOutbox;
        throw error;
      }
    }),
  };

  return api;
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
    brakeServiceApplications: [],
    brakeComponentInstallations: [],
    brakeServiceOutbox: [],
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
  const recalcInputLoader = {
    load: jest.fn(async (vehicleId: string) => {
      const current = store.brakeHealthCurrent.get(vehicleId);
      if (!current?.isInitialized) return null;
      const vehicle = store.vehicles.get(vehicleId);
      const latest = store.vehicleLatestState.get(vehicleId);
      const anchorDate = current.anchorServiceDate
        ? new Date(String(current.anchorServiceDate))
        : null;
      const trips = store.tripDrivingImpact.filter((trip) => {
        if (trip.vehicleId !== vehicleId) return false;
        if (!anchorDate || !trip.tripStartedAt) return true;
        return new Date(String(trip.tripStartedAt)).getTime() >= anchorDate.getTime();
      });
      let rawDistanceKm = 0;
      let authoritativeDistanceKm = 0;
      for (const trip of trips) {
        const raw = Number(trip.distanceKm ?? 0);
        rawDistanceKm += raw;
        authoritativeDistanceKm += Number(trip.authoritativeDistanceKm ?? raw);
      }
      return {
        vehicleId,
        organizationId: vehicle?.organizationId ?? null,
        anchor: {
          isInitialized: true,
          anchorServiceDate: anchorDate?.toISOString() ?? null,
          anchorOdometerKm: Number(current.anchorOdometerKm ?? 0),
          anchorValidationStatus: String(current.anchorValidationStatus ?? ''),
          calibrationCount: Number(current.calibrationCount ?? 0),
          frontPadAnchorMm: current.frontPadAnchorMm ?? null,
          rearPadAnchorMm: current.rearPadAnchorMm ?? null,
          frontDiscAnchorMm: current.frontDiscAnchorMm ?? null,
          rearDiscAnchorMm: current.rearDiscAnchorMm ?? null,
          frontPadKFactor: Number(current.frontPadKFactor ?? 1),
          rearPadKFactor: Number(current.rearPadKFactor ?? 1),
          frontDiscKFactor: Number(current.frontDiscKFactor ?? 1),
          rearDiscKFactor: Number(current.rearDiscKFactor ?? 1),
          updatedAt: new Date().toISOString(),
        },
        vehicle: {
          fuelType: vehicle?.fuelType ?? null,
          brakeForceFrontPercent: vehicle?.brakeForceFrontPercent ?? null,
        },
        latestOdometerKm: latest?.odometerKm ?? null,
        componentInstallations: [],
        referenceSpecs: [],
        evidence: [],
        tdiAggregate: {
          tripCount: trips.length,
          rawDistanceKm,
          authoritativeDistanceKm,
          latestTripStartedAt: trips.at(-1)?.tripStartedAt
            ? String(trips.at(-1)!.tripStartedAt)
            : null,
          latestUpdatedAt: null,
          hardBrakePer100KmSum: trips.reduce(
            (sum, trip) => sum + Number(trip.hardBrakePer100Km ?? 0),
            0,
          ),
          fullBrakingPer100KmSum: trips.reduce(
            (sum, trip) => sum + Number(trip.fullBrakingPer100Km ?? 0),
            0,
          ),
        },
        ledgerAggregate: {
          totalEvents: 0,
          harshBraking: 0,
          extremeBraking: 0,
          fullBraking: 0,
          highSpeedBraking: 0,
          latestOccurredAt: null,
        },
        activeDtc: [],
        gapPolicyVersion: 'brake-coverage-gap-v1',
      };
    }),
  };
  const brakeHealth = new BrakeHealthService(
    prisma as never,
    drivingImpact as never,
    brakeEvidence,
    recalcInputLoader as never,
  );
  const recalcOrchestrator = {
    enqueue: jest.fn().mockImplementation(async (_input: { vehicleId: string }) => {
      return brakeHealth.recalculate(_input.vehicleId);
    }),
  };
  const outbox = new BrakeServiceOutboxService(prisma as never, recalcOrchestrator as never);
  const application = new BrakeServiceApplicationService(prisma as never, brakeHealth, outbox);
  const lifecycle = new BrakeLifecycleService(prisma as never, application);

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
    scope: ['front_pads', 'rear_pads', 'front_discs', 'rear_discs'],
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
