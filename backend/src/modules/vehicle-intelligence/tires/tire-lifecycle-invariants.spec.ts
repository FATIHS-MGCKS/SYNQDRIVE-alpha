import { BadRequestException, ConflictException } from '@nestjs/common';
import { TireSetupStatus } from '@prisma/client';
import { TireLifecycleService } from './tire-lifecycle.service';
import { TireIdentityService } from './tire-identity.service';
import { TireHealthService } from './tire-health.service';
import { TireWearModelService } from './tire-wear-model.service';

const VEHICLE_ID = 'veh-1';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const SETUP_ACTIVE = 'setup-active';
const SETUP_STORED = 'setup-stored';

function buildHarness() {
  const state = {
    setups: new Map<string, any>([
      [
        SETUP_ACTIVE,
        {
          id: SETUP_ACTIVE,
          organizationId: ORG_A,
          vehicleId: VEHICLE_ID,
          status: TireSetupStatus.ACTIVE,
          removedAt: null,
          totalKmOnSet: 4200,
          cityKm: 1200,
          highwayKm: 2500,
          ruralKm: 500,
          tireSeason: 'SUMMER',
          measurements: [],
        },
      ],
      [
        SETUP_STORED,
        {
          id: SETUP_STORED,
          organizationId: ORG_A,
          vehicleId: VEHICLE_ID,
          status: TireSetupStatus.STORED,
          removedAt: new Date('2026-05-01'),
          totalKmOnSet: 18000,
          cityKm: 5000,
          highwayKm: 10000,
          ruralKm: 3000,
          tireSeason: 'WINTER',
          measurements: [],
        },
      ],
    ]),
    events: [] as any[],
  };

  const tireIdentity = {
    dismountAllForSetup: jest.fn().mockResolvedValue(undefined),
    remountStoredSetupTires: jest.fn().mockResolvedValue([]),
    ensureTiresForSetup: jest.fn().mockResolvedValue([]),
    createTireSet: jest.fn().mockResolvedValue([]),
    replaceAtPosition: jest.fn().mockResolvedValue({ id: 'tire-new' }),
    applyRotation: jest.fn().mockResolvedValue([]),
    getActiveTiresForSetup: jest.fn().mockResolvedValue([]),
    retireTireAtPosition: jest.fn().mockResolvedValue({ id: 'tire-retired', totalKmOnTire: 9000 }),
  };

  const tireHealthService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  };

  const wearModel = {
    computeWearAnalysis: jest.fn().mockResolvedValue({
      frontLeftMm: 5,
      frontRightMm: 5,
      rearLeftMm: 4.8,
      rearRightMm: 4.8,
      referenceNewTreadFront: 8,
      referenceNewTreadRear: 8,
      explainability: { currentTreadSource: 'estimated' },
    }),
    calibrateFromMeasurement: jest.fn().mockResolvedValue(null),
    computePositionalRegenFactors: jest.fn().mockReturnValue({ overall: 1, front: 1, rear: 1 }),
    isRotationAllowedForStaggered: jest.fn().mockReturnValue(false),
  };

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id !== VEHICLE_ID) return null;
        return { organizationId: ORG_A, mileageKm: 28000 };
      }),
      findFirst: jest.fn(),
    },
    vehicleTireSetup: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id) return state.setups.get(where.id) ?? null;
        if (where.status === TireSetupStatus.ACTIVE && where.removedAt === null) {
          return [...state.setups.values()].find(
            (s) => s.vehicleId === where.vehicleId && s.status === TireSetupStatus.ACTIVE,
          ) ?? null;
        }
        if (where.status === TireSetupStatus.STORED) {
          return [...state.setups.values()].find(
            (s) => s.vehicleId === where.vehicleId && s.status === TireSetupStatus.STORED,
          ) ?? null;
        }
        return null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const current = state.setups.get(where.id);
        if (!current) throw new Error('setup missing');
        const next = { ...current, ...data };
        state.setups.set(where.id, next);
        return next;
      }),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const id = `setup-${state.setups.size + 1}`;
        const row = { id, measurements: [], ...data };
        state.setups.set(id, row);
        return row;
      }),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue({
        odometerKm: 30000,
        providerSource: 'DIMO',
        providerFetchedAt: new Date(),
        sourceTimestamp: new Date(),
        lastSeenAt: new Date(),
        source: 'dimo',
      }),
    },
    tireEvent: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        state.events.push(data);
        return { id: `event-${state.events.length}` };
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleTireSetupMountPeriod: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'period-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicleTireTreadMeasurement: {
      create: jest.fn().mockResolvedValue({ id: 'meas-1' }),
    },
    tire: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') {
        const tx = {
          vehicleTireSetup: prisma.vehicleTireSetup,
          tireEvent: prisma.tireEvent,
          tire: prisma.tire,
          vehicleTireTreadMeasurement: prisma.vehicleTireTreadMeasurement,
          vehicleTireSetupMountPeriod: prisma.vehicleTireSetupMountPeriod,
        };
        return arg(tx);
      }
      return Promise.all(arg);
    }),
  } as any;

  const svc = new TireLifecycleService(
    prisma,
    wearModel as unknown as TireWearModelService,
    tireHealthService as unknown as TireHealthService,
    tireIdentity as unknown as TireIdentityService,
  );

  return { svc, prisma, tireIdentity, tireHealthService, wearModel, state };
}

describe('tire lifecycle invariants', () => {
  it('rejects staggered rotation when template is not allowed', async () => {
    const { svc, prisma } = buildHarness();
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({
      id: SETUP_ACTIVE,
      vehicleId: VEHICLE_ID,
      status: TireSetupStatus.ACTIVE,
      removedAt: null,
      frontDimension: '225/40R18',
      rearDimension: '255/35R18',
      measurements: [],
    });

    await expect(
      svc.rotateTires(VEHICLE_ID, { template: 'front_to_rear' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activates stored set transactionally and preserves cumulative km', async () => {
    const { svc, tireIdentity, state, prisma } = buildHarness();

    const result = await svc.activateStoredSet({
      vehicleId: VEHICLE_ID,
      storedSetupId: SETUP_STORED,
      odometerKm: 30500,
      manualConfirmOdometer: true,
    });

    expect(result.preservedKm?.totalKmOnSet).toBe(18000);
    expect(state.setups.get(SETUP_STORED)?.status).toBe(TireSetupStatus.ACTIVE);
    expect(state.setups.get(SETUP_STORED)?.totalKmOnSet).toBe(18000);
    expect(state.setups.get(SETUP_STORED)?.installedOdometerKm).toBe(30500);
    expect(state.setups.get(SETUP_STORED)?.odometerAnchorStatus).toBe('ANCHORED');
    expect(state.setups.get(SETUP_ACTIVE)?.status).toBe(TireSetupStatus.STORED);
    expect(tireIdentity.dismountAllForSetup).toHaveBeenCalledWith(
      SETUP_ACTIVE,
      expect.any(Date),
      expect.anything(),
    );
    expect(tireIdentity.remountStoredSetupTires).toHaveBeenCalled();
    expect(prisma.vehicleTireSetupMountPeriod.create).toHaveBeenCalled();
    expect(state.events.some((e) => e.payload?.command === 'activateStoredSet')).toBe(true);
  });

  it('ignores unconfirmed client odometer on stored set reactivation', async () => {
    const { svc, state } = buildHarness();

    await svc.activateStoredSet({
      vehicleId: VEHICLE_ID,
      storedSetupId: SETUP_STORED,
      odometerKm: 999999,
    });

    expect(state.setups.get(SETUP_STORED)?.installedOdometerKm).toBe(30000);
    expect(state.setups.get(SETUP_STORED)?.installedOdometerSource).toBe('PROVIDER_DIMO');
  });

  it('storeTireSet transitions ACTIVE to STORED without losing cumulative km', async () => {
    const { svc, state } = buildHarness();

    const result = await svc.storeTireSet({ vehicleId: VEHICLE_ID });

    expect(result.storedSetupId).toBe(SETUP_ACTIVE);
    expect(state.setups.get(SETUP_ACTIVE)?.status).toBe(TireSetupStatus.STORED);
    expect(state.setups.get(SETUP_ACTIVE)?.totalKmOnSet).toBe(4200);
  });

  it('removeTireSet marks setup REMOVED and writes event', async () => {
    const { svc, state } = buildHarness();

    const result = await svc.removeTireSet({ vehicleId: VEHICLE_ID, tireSetupId: SETUP_STORED });

    expect(result.removedSetupId).toBe(SETUP_STORED);
    expect(state.setups.get(SETUP_STORED)?.status).toBe(TireSetupStatus.REMOVED);
  });

  it('retireTire retires active wheel and preserves tire cumulative km in event payload', async () => {
    const { svc, tireIdentity, state } = buildHarness();

    const result = await svc.retireTire({
      vehicleId: VEHICLE_ID,
      position: 'FL',
    });

    expect(result.position).toBe('FL');
    expect(tireIdentity.retireTireAtPosition).toHaveBeenCalled();
    expect(
      state.events.some(
        (e) => e.payload?.command === 'retireTire' && e.payload?.preservedKmOnTire === 9000,
      ),
    ).toBe(true);
  });

  it('rejects multi-tenant access when organization does not match vehicle', async () => {
    const { svc } = buildHarness();

    await expect(
      svc.storeTireSet({ vehicleId: VEHICLE_ID, organizationId: ORG_B }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps concurrent active setup unique violation to ConflictException on install', async () => {
    const { svc, prisma } = buildHarness();
    prisma.$transaction.mockImplementationOnce(async () => {
      const err: any = new Error('unique');
      err.code = 'P2002';
      err.meta = { target: ['vehicle_tire_setups_one_active_setup_per_vehicle'] };
      throw err;
    });

    await expect(
      svc.installTireSet(VEHICLE_ID, { name: 'Second active', archiveCurrent: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back when retireTire fails inside transaction', async () => {
    const { svc, tireIdentity, state } = buildHarness();
    tireIdentity.retireTireAtPosition.mockResolvedValueOnce(null);

    await expect(
      svc.retireTire({ vehicleId: VEHICLE_ID, position: 'RR' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.events.filter((e) => e.payload?.command === 'retireTire')).toHaveLength(0);
  });

  it('rejects invalid lifecycle transition when storing a STORED setup', async () => {
    const { svc } = buildHarness();

    await expect(
      svc.storeTireSet({ vehicleId: VEHICLE_ID, tireSetupId: SETUP_STORED }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
