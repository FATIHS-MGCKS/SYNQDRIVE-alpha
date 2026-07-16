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

type InMemoryStore = {
  vehicles: Map<string, Record<string, unknown>>;
  brakeHealthCurrent: Map<string, Record<string, unknown>>;
  vehicleBrakeReferenceSpec: Array<Record<string, unknown>>;
  vehicleServiceEvent: Array<Record<string, unknown>>;
  brakeEvidence: Array<Record<string, unknown>>;
  vehicleLatestState: Map<string, Record<string, unknown>>;
  tripDrivingImpact: Array<Record<string, unknown>>;
};

function createInMemoryPrisma(store: InMemoryStore) {
  let eventSeq = 0;
  let evidenceSeq = 0;
  let specSeq = 0;

  return {
    vehicle: {
      findUnique: jest.fn(async ({ where, select }: any) => {
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
      findUnique: jest.fn(async ({ where, select }: any) => {
        const row = store.vehicleLatestState.get(where.vehicleId);
        if (!row) return null;
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = row[key];
        }
        return out;
      }),
    },
    vehicleBrakeReferenceSpec: {
      findMany: jest.fn(async ({ where, orderBy, take }: any) => {
        let rows = store.vehicleBrakeReferenceSpec.filter((r) => r.vehicleId === where.vehicleId);
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort(
            (a, b) =>
              new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime(),
          );
        }
        if (typeof take === 'number') rows = rows.slice(0, take);
        return rows;
      }),
      create: jest.fn(async ({ data }: any) => {
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
      findUnique: jest.fn(async ({ where }: any) => store.brakeHealthCurrent.get(where.vehicleId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
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
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = store.brakeHealthCurrent.get(where.vehicleId);
        if (!existing) throw new Error('brakeHealthCurrent not found');
        const merged = { ...existing, ...data, updatedAt: new Date() };
        store.brakeHealthCurrent.set(where.vehicleId, merged);
        return merged;
      }),
    },
    vehicleServiceEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `evt-${++eventSeq}`, ...data };
        store.vehicleServiceEvent.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = store.vehicleServiceEvent.findIndex((e) => e.id === where.id);
        if (idx < 0) throw new Error('service event not found');
        store.vehicleServiceEvent[idx] = { ...store.vehicleServiceEvent[idx], ...data };
        return store.vehicleServiceEvent[idx];
      }),
      findFirst: jest.fn(async ({ where, orderBy, select }: any) => {
        let rows = store.vehicleServiceEvent.filter(
          (e) => e.vehicleId === where.vehicleId && e.eventType === where.eventType,
        );
        if (orderBy?.eventDate === 'desc') {
          rows = [...rows].sort(
            (a, b) => new Date(String(b.eventDate)).getTime() - new Date(String(a.eventDate)).getTime(),
          );
        }
        const row = rows[0] ?? null;
        if (!row || !select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = row[key];
        }
        return out;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        store.vehicleServiceEvent.filter(
          (e) => e.vehicleId === where.vehicleId && e.eventType === where.eventType,
        ),
      ),
    },
    brakeEvidence: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `ev-${++evidenceSeq}`, createdAt: new Date(), ...data };
        store.brakeEvidence.push(row);
        return row;
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const item of data) {
          store.brakeEvidence.push({ id: `ev-${++evidenceSeq}`, createdAt: new Date(), ...item });
        }
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where, orderBy, take }: any) => {
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
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        let rows = store.brakeEvidence.filter((e) => e.vehicleId === where.vehicleId);
        if (where.source?.in) {
          rows = rows.filter((e) => where.source.in.includes(e.source));
        }
        if (where.OR) {
          rows = rows.filter((e) =>
            where.OR.some((clause: any) => {
              if (clause.measuredPadMm?.not === null) return e.measuredPadMm != null;
              if (clause.measuredDiscMm?.not === null) return e.measuredDiscMm != null;
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
      }),
    },
    tripDrivingImpact: {
      findMany: jest.fn(async () => []),
    },
  };
}

function createBrakeRegistrationHarness(input?: {
  registrationMileageKm?: number | null;
  latestStateOdometerKm?: number | null;
}) {
  const vehicleId = 'veh-reg-1';
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

  const prisma = createInMemoryPrisma(store) as any;
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
  } as any;
  const brakeEvidence = new BrakeEvidenceService(prisma);
  const brakeHealth = new BrakeHealthService(prisma, drivingImpact, brakeEvidence);
  const lifecycle = new BrakeLifecycleService(prisma, brakeHealth, brakeEvidence);

  const rentalHealth = new RentalHealthService(
    prisma,
    { getSummary: jest.fn() } as any,
    { getSummary: jest.fn() } as any,
    brakeHealth,
    { getSummary: jest.fn() } as any,
    { getAiHealthCareSignals: jest.fn() } as any,
    { evaluateCompliance: jest.fn(), toRentalModuleHealth: jest.fn() } as any,
    { getActiveOverride: jest.fn().mockResolvedValue(null) } as any,
  );

  const evaluateBrakes = (summary: any) => (rentalHealth as any).evaluateBrakes(summary);

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
        latestStateOdometerKm: latestState?.odometerKm ?? null,
      });
    }
    return null;
  }

  return {
    store,
    prisma,
    brakeHealth,
    lifecycle,
    evaluateBrakes,
    vehicleId,
    simulateRegisterFromDimoBrakes,
  };
}

describe('Brake registration initialization regression', () => {
  describe('register-from-dimo pipeline', () => {
    it('1) NEW + odometer + measured pad values → initialized GOOD with measured evidence', async () => {
      const h = createBrakeRegistrationHarness({ latestStateOdometerKm: 2500 });
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 1500,
        frontPadThickness: 10.5,
        rearPadThickness: 10.2,
        frontRotorWidth: 28,
        rearRotorWidth: 26,
      });

      expect(init?.initialized).toBe(true);
      const current = h.store.brakeHealthCurrent.get(h.vehicleId);
      expect(current?.isInitialized).toBe(true);
      expect(current?.anchorValidationStatus).toBe('measured_anchor');
      expect(current?.stateClass).toBe('MEASURED');

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(true);
      expect(summary.overallCondition).toBe('GOOD');
      expect(summary.dataBasis).toBe('MEASURED');

      const rental = h.evaluateBrakes(summary);
      expect(rental.state).toBe('good');
      expect(rental.evidence_type).toBe('measured');

      const measuredEvidence = h.store.brakeEvidence.filter((e) => e.measuredPadMm != null);
      expect(measuredEvidence.length).toBeGreaterThan(0);
      expect(measuredEvidence.every((e) => e.source === 'MANUAL_MEASUREMENT')).toBe(true);
    });

    it('2) NEW + odometer without measured mm → documented baseline, not MEASURED', async () => {
      const h = createBrakeRegistrationHarness({
        registrationMileageKm: 800,
        latestStateOdometerKm: 1200,
      });
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 800,
      });

      expect(init?.initialized).toBe(true);
      const current = h.store.brakeHealthCurrent.get(h.vehicleId);
      expect(current?.isInitialized).toBe(true);
      expect(current?.anchorValidationStatus).toBe('spec_fallback_anchor');
      expect(current?.stateClass).toBe('ESTIMATED');

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.overallCondition).toBe('GOOD');
      expect(summary.dataBasis).toBe('DOCUMENTED');
      expect(summary.stateClass).toBe('ESTIMATED');

      const rental = h.evaluateBrakes(summary);
      expect(rental.state).toBe('good');
      expect(rental.evidence_type).toBe('document');
      expect(rental.evidence_type).not.toBe('measured');

      expect(h.store.brakeEvidence).toHaveLength(0);
    });

    it('3) brake specs without odometer → no fake GOOD, stays NO_BASELINE', async () => {
      const h = createBrakeRegistrationHarness();
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'USED',
        frontPadThickness: 8.5,
        rearPadThickness: 7.8,
      });

      expect(init).toBeNull();
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);

      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
      expect(summary.stateClass).toBe('NO_BASELINE');
      expect(summary.overallCondition).not.toBe('GOOD');
      expect(summary.message).toMatch(/odometer|baseline/i);

      const rental = h.evaluateBrakes(summary);
      expect(rental.state).toBe('unknown');
      expect(rental.state).not.toBe('good');
      expect(rental.reason).toMatch(/Baseline|belastbare/i);
    });
  });
});
