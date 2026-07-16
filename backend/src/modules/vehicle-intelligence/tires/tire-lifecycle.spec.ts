import { BadRequestException } from '@nestjs/common';
import { TireSetupStatus } from '@prisma/client';
import {
  resolveReplacementPositions,
  normalizeWheelPosition,
  normalizeMeasurementSource,
  TireLifecycleService,
} from './tire-lifecycle.service';
import { TireIdentityService } from './tire-identity.service';
import { TireHealthService } from './tire-health.service';
import { TireWearModelService } from './tire-wear-model.service';

// ═══════════════════════════════════════════════════════════════════════════════
//  PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeWheelPosition', () => {
  it('accepts short codes', () => {
    expect(normalizeWheelPosition('FL')).toBe('FL');
    expect(normalizeWheelPosition('fr')).toBe('FR');
    expect(normalizeWheelPosition(' rl ')).toBe('RL');
  });

  it('accepts long forms', () => {
    expect(normalizeWheelPosition('FRONT_LEFT')).toBe('FL');
    expect(normalizeWheelPosition('REAR_RIGHT')).toBe('RR');
    expect(normalizeWheelPosition('BACK_LEFT')).toBe('RL');
  });

  it('rejects garbage', () => {
    expect(normalizeWheelPosition('spare')).toBeNull();
    expect(normalizeWheelPosition(null)).toBeNull();
  });
});

describe('normalizeMeasurementSource', () => {
  it('defaults unknown sources to manual', () => {
    expect(normalizeMeasurementSource(undefined)).toBe('manual');
    expect(normalizeMeasurementSource('totally-made-up')).toBe('manual');
  });
});

describe('resolveReplacementPositions', () => {
  it('full_set replaces all four wheels', () => {
    expect(resolveReplacementPositions('full_set')).toEqual(['FL', 'FR', 'RL', 'RR']);
  });

  it('single replaces only the one given wheel', () => {
    expect(resolveReplacementPositions('single', ['RR'])).toEqual(['RR']);
    expect(resolveReplacementPositions('single', ['FRONT_LEFT'])).toEqual(['FL']);
  });

  it('single rejects zero or multiple positions', () => {
    expect(() => resolveReplacementPositions('single', [])).toThrow();
    expect(() => resolveReplacementPositions('single', ['FL', 'FR'])).toThrow();
  });

  it('axle replaces exactly the two wheels on one axle', () => {
    expect(resolveReplacementPositions('axle', ['FRONT_AXLE'])).toEqual(['FL', 'FR']);
    expect(resolveReplacementPositions('axle', ['REAR'])).toEqual(['RL', 'RR']);
    expect(resolveReplacementPositions('axle', ['FL', 'FR'])).toEqual(['FL', 'FR']);
    expect(resolveReplacementPositions('axle', ['RL', 'RR'])).toEqual(['RL', 'RR']);
  });

  it('axle rejects a mixed-axle pair', () => {
    expect(() => resolveReplacementPositions('axle', ['FL', 'RR'])).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST FIXTURES — constructor order: prisma, wearModel, tireHealth, tireIdentity
// ═══════════════════════════════════════════════════════════════════════════════

const VEHICLE_ID = 'veh-1';
const SETUP_ID = 'setup-1';
const ORG_ID = 'org-1';

const activeSetup = {
  id: SETUP_ID,
  organizationId: ORG_ID,
  vehicleId: VEHICLE_ID,
  status: TireSetupStatus.ACTIVE,
  removedAt: null,
  brandModelFront: 'Michelin Pilot',
  brandModelRear: 'Michelin Pilot',
  dotCodeFront: 'DOT-F',
  dotCodeRear: 'DOT-R',
  tireSeason: 'SUMMER',
  frontDimension: '225/45R17',
  rearDimension: '225/45R17',
  installedAt: new Date('2025-01-01'),
  measurements: [],
};

const wearAnalysis = {
  frontLeftMm: 5.2,
  frontRightMm: 5.0,
  rearLeftMm: 4.8,
  rearRightMm: 4.6,
  referenceNewTreadFront: 8.0,
  referenceNewTreadRear: 8.0,
  explainability: { currentTreadSource: 'estimated' },
};

function buildMocks() {
  const tireIdentity = {
    replaceAtPosition: jest.fn().mockResolvedValue({ id: 'new-tire' }),
    ensureTiresForSetup: jest.fn().mockResolvedValue([]),
    applyRotation: jest.fn().mockResolvedValue([]),
    getActiveTiresForSetup: jest.fn().mockResolvedValue([
      { id: 't-fl', currentPosition: 'FRONT_LEFT' },
      { id: 't-fr', currentPosition: 'FRONT_RIGHT' },
      { id: 't-rl', currentPosition: 'REAR_LEFT' },
      { id: 't-rr', currentPosition: 'REAR_RIGHT' },
    ]),
    createTireSet: jest.fn().mockResolvedValue([]),
    dismountAllForSetup: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<
    Pick<
      TireIdentityService,
      | 'replaceAtPosition'
      | 'ensureTiresForSetup'
      | 'applyRotation'
      | 'getActiveTiresForSetup'
      | 'createTireSet'
      | 'dismountAllForSetup'
    >
  >;

  const tireHealthService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<TireHealthService, 'recalculate'>>;

  const wearModel = {
    computeWearAnalysis: jest.fn().mockResolvedValue(wearAnalysis),
    calibrateFromMeasurement: jest.fn().mockResolvedValue(null),
    computePositionalRegenFactors: jest.fn().mockReturnValue({
      overall: 1,
      front: 1,
      rear: 1,
    }),
    isRotationAllowedForStaggered: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<
    Pick<
      TireWearModelService,
      | 'computeWearAnalysis'
      | 'calibrateFromMeasurement'
      | 'computePositionalRegenFactors'
      | 'isRotationAllowedForStaggered'
    >
  >;

  const prisma = {
    vehicleTireSetup: {
      findFirst: jest.fn().mockResolvedValue(activeSetup),
      update: jest.fn().mockResolvedValue(activeSetup),
      create: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        id: VEHICLE_ID,
        organizationId: ORG_ID,
        fuelType: 'Gasoline',
        driveType: 'FWD',
        mileageKm: 24000,
      }),
      findFirst: jest.fn(),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue({
        odometerKm: 25000,
        providerSource: 'DIMO',
        providerFetchedAt: new Date(),
        sourceTimestamp: new Date(),
        lastSeenAt: new Date(),
        source: 'dimo',
      }),
    },
    tireEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleTireSetupMountPeriod: {
      create: jest.fn().mockResolvedValue({ id: 'period-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vehicleTireTreadMeasurement: {
      create: jest.fn().mockResolvedValue({ id: 'meas-1' }),
    },
    tire: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  } as any;

  const svc = new TireLifecycleService(
    prisma,
    wearModel as unknown as TireWearModelService,
    tireHealthService as unknown as TireHealthService,
    tireIdentity as unknown as TireIdentityService,
  );

  return { svc, prisma, wearModel, tireHealthService, tireIdentity };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROTATION MOVE MAPS (private pure helper via typed access)
// ═══════════════════════════════════════════════════════════════════════════════

describe('rotation move maps', () => {
  const { svc } = buildMocks();
  const moves = (template: string): Record<string, string> =>
    (svc as unknown as { getRotationMoves(t: string): Record<string, string> }).getRotationMoves(
      template,
    );

  const ALL = ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'];

  it.each(['front_to_rear', 'cross', 'side_swap', 'full_rotation'])(
    '%s is a real permutation that changes every position',
    (template) => {
      const map = moves(template);
      const sources = Object.keys(map).sort();
      const targets = Object.values(map).sort();
      expect(sources).toEqual([...ALL].sort());
      expect(new Set(targets).size).toBe(4);
      expect(targets).toEqual([...ALL].sort());
      for (const [from, to] of Object.entries(map)) {
        expect(from).not.toBe(to);
      }
    },
  );

  it('front_to_rear swaps the axles', () => {
    expect(moves('front_to_rear')).toMatchObject({
      FRONT_LEFT: 'REAR_LEFT',
      REAR_LEFT: 'FRONT_LEFT',
    });
  });

  it('unknown template yields no moves (caller rejects it)', () => {
    expect(moves('does_not_exist')).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LIFECYCLE BUSINESS LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

describe('TireLifecycleService business logic', () => {
  it('single replacement calls replaceAtPosition only for the affected wheel', async () => {
    const { svc, tireIdentity, tireHealthService } = buildMocks();
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'm1' } as any,
      kFactors: null,
      source: 'calibration',
    });

    const result = await svc.replaceTires({
      vehicleId: VEHICLE_ID,
      scope: 'single',
      positions: ['RR'],
    });

    expect(result.positions).toEqual(['RR']);
    expect(tireIdentity.replaceAtPosition).toHaveBeenCalledTimes(1);
    expect(tireIdentity.replaceAtPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        tireSetId: SETUP_ID,
        position: 'RR',
        initialTreadDepthMm: wearAnalysis.referenceNewTreadRear,
      }),
    );
    expect(tireIdentity.replaceAtPosition).not.toHaveBeenCalledWith(
      expect.objectContaining({ position: 'FL' }),
    );
    expect(tireHealthService.recalculate).toHaveBeenCalledTimes(1);
    expect(tireHealthService.recalculate).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it('front axle replacement replaces only FL and FR', async () => {
    const { svc, tireIdentity } = buildMocks();
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'm1' } as any,
      kFactors: null,
      source: 'calibration',
    });

    await svc.replaceTires({
      vehicleId: VEHICLE_ID,
      scope: 'axle',
      positions: ['FRONT_AXLE'],
    });

    expect(tireIdentity.replaceAtPosition).toHaveBeenCalledTimes(2);
    const positions = tireIdentity.replaceAtPosition.mock.calls.map(
      (c) => c[0].position,
    );
    expect(positions.sort()).toEqual(['FL', 'FR']);
    expect(positions).not.toContain('RL');
    expect(positions).not.toContain('RR');
  });

  it('rear axle replacement replaces only RL and RR', async () => {
    const { svc, tireIdentity } = buildMocks();
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'm1' } as any,
      kFactors: null,
      source: 'calibration',
    });

    await svc.replaceTires({
      vehicleId: VEHICLE_ID,
      scope: 'axle',
      positions: ['REAR'],
    });

    const positions = tireIdentity.replaceAtPosition.mock.calls.map(
      (c) => c[0].position,
    );
    expect(positions.sort()).toEqual(['RL', 'RR']);
  });

  it('full_set replacement uses installTireSet, not per-wheel replaceAtPosition', async () => {
    const { svc, tireIdentity, prisma } = buildMocks();
    prisma.vehicleTireSetup.create.mockResolvedValue({
      ...activeSetup,
      id: 'setup-new',
      organizationId: ORG_ID,
    });

    const result = await svc.replaceTires({
      vehicleId: VEHICLE_ID,
      scope: 'full_set',
      newSetup: { name: 'Winter set' },
    });

    expect(result.scope).toBe('full_set');
    expect(result.newSetupId).toBe('setup-new');
    expect(tireIdentity.createTireSet).toHaveBeenCalled();
    expect(tireIdentity.replaceAtPosition).not.toHaveBeenCalled();
  });

  it('rotation delegates position moves to TireIdentityService.applyRotation', async () => {
    const { svc, tireIdentity, tireHealthService } = buildMocks();
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'm1' } as any,
      kFactors: null,
      source: 'calibration',
    });

    await svc.rotateTires(VEHICLE_ID, { template: 'front_to_rear' });

    expect(tireIdentity.ensureTiresForSetup).toHaveBeenCalled();
    expect(tireIdentity.applyRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        tireSetId: SETUP_ID,
        moveMap: expect.objectContaining({
          FRONT_LEFT: 'REAR_LEFT',
          REAR_LEFT: 'FRONT_LEFT',
        }),
        rotationTemplate: 'front_to_rear',
      }),
    );
    expect(tireHealthService.recalculate).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it('rotation without wear data still completes without throwing', async () => {
    const { svc, wearModel, tireIdentity, tireHealthService } = buildMocks();
    wearModel.computeWearAnalysis.mockResolvedValue(null);

    await svc.rotateTires(VEHICLE_ID, { template: 'cross' });

    expect(tireIdentity.applyRotation).toHaveBeenCalled();
    expect(tireHealthService.recalculate).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it('partial replacement without wear baseline throws a controlled BadRequestException', async () => {
    const { svc, wearModel } = buildMocks();
    wearModel.computeWearAnalysis.mockResolvedValue(null);

    await expect(
      svc.replaceTires({
        vehicleId: VEHICLE_ID,
        scope: 'single',
        positions: ['FL'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('partial replacement without active setup throws BadRequestException', async () => {
    const { svc, prisma } = buildMocks();
    prisma.vehicleTireSetup.findFirst.mockResolvedValue(null);

    await expect(
      svc.replaceTires({
        vehicleId: VEHICLE_ID,
        scope: 'single',
        positions: ['FL'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recalculate is invoked exactly once after partial replacement (no duplicate alert path)', async () => {
    const { svc, tireHealthService } = buildMocks();
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'm1' } as any,
      kFactors: null,
      source: 'calibration',
    });

    await svc.replaceTires({
      vehicleId: VEHICLE_ID,
      scope: 'single',
      positions: ['FL'],
    });

    expect(tireHealthService.recalculate).toHaveBeenCalledTimes(1);
  });
});
