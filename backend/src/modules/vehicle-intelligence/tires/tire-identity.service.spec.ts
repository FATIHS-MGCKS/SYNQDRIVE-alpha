import { TireIdentityService, wheelPosToDb, dbPosToWheel } from './tire-identity.service';
import { TirePosition } from '@prisma/client';

describe('TireIdentityService', () => {
  const buildPrisma = () =>
    ({
      tire: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      tirePositionHistory: { create: jest.fn() },
      tireMeasurement: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }) as any;

  it('wheelPosToDb / dbPosToWheel round-trip', () => {
    expect(wheelPosToDb('FL')).toBe(TirePosition.FRONT_LEFT);
    expect(dbPosToWheel(TirePosition.FRONT_RIGHT)).toBe('FR');
  });

  it('applyRotation swaps tire.currentPosition (FL→RL example)', async () => {
    const prisma = buildPrisma();
    const tireA = {
      id: 'tire-a',
      currentPosition: TirePosition.FRONT_LEFT,
      tireSetId: 'setup-1',
    };
    const tireB = {
      id: 'tire-b',
      currentPosition: TirePosition.REAR_LEFT,
      tireSetId: 'setup-1',
    };
    prisma.tire.findMany
      .mockResolvedValueOnce([tireA, tireB])
      .mockResolvedValueOnce([
        { ...tireA, currentPosition: TirePosition.REAR_LEFT },
        { ...tireB, currentPosition: TirePosition.FRONT_LEFT },
      ]);
    prisma.tire.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ id: where.id, currentPosition: data.currentPosition }),
    );
    prisma.tirePositionHistory.create.mockResolvedValue({});

    const svc = new TireIdentityService(prisma);
    const result = await svc.applyRotation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      moveMap: {
        FRONT_LEFT: 'REAR_LEFT',
        REAR_LEFT: 'FRONT_LEFT',
      },
      changedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(prisma.tire.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tire-a' },
        data: { currentPosition: TirePosition.REAR_LEFT },
      }),
    );
    expect(prisma.tirePositionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tireId: 'tire-a' }),
      }),
    );
    expect(result).toHaveLength(2);
  });

  it('replaceAtPosition dismounts old tire and creates a new identity', async () => {
    const prisma = buildPrisma();
    const oldTire = {
      id: 'old-tire',
      currentPosition: TirePosition.FRONT_RIGHT,
      active: true,
    };
    prisma.tire.findFirst.mockResolvedValue(oldTire);
    prisma.tire.update.mockResolvedValue({ ...oldTire, active: false });
    prisma.tire.create.mockResolvedValue({
      id: 'new-tire',
      currentPosition: TirePosition.FRONT_RIGHT,
      initialTreadDepthMm: 8,
    });
    prisma.tirePositionHistory.create.mockResolvedValue({});
    prisma.tireMeasurement.create.mockResolvedValue({});

    const svc = new TireIdentityService(prisma);
    const created = await svc.replaceAtPosition({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      position: 'FR',
      initialTreadDepthMm: 8,
      brand: 'Michelin',
    });

    expect(prisma.tire.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-tire' },
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(prisma.tire.create).toHaveBeenCalled();
    expect(prisma.tireMeasurement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tireId: 'new-tire', measuredTreadMm: 8 }),
      }),
    );
    expect(created.id).toBe('new-tire');
  });

  it('replaceAtPosition works when no active tire exists at position', async () => {
    const prisma = buildPrisma();
    prisma.tire.findFirst.mockResolvedValue(null);
    prisma.tire.create.mockResolvedValue({
      id: 'fresh-tire',
      currentPosition: TirePosition.FRONT_LEFT,
      initialTreadDepthMm: 7,
    });
    prisma.tirePositionHistory.create.mockResolvedValue({});
    prisma.tireMeasurement.create.mockResolvedValue({});

    const svc = new TireIdentityService(prisma);
    const created = await svc.replaceAtPosition({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      position: 'FL',
      initialTreadDepthMm: 7,
    });

    expect(prisma.tire.update).not.toHaveBeenCalled();
    expect(prisma.tire.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentPosition: TirePosition.FRONT_LEFT,
          initialTreadDepthMm: 7,
          active: true,
        }),
      }),
    );
    expect(prisma.tirePositionHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.tireMeasurement.create).toHaveBeenCalled();
    expect(created.id).toBe('fresh-tire');
  });

  it('replaceAtPosition sets dismountedAt on the previous tire and writes history', async () => {
    const prisma = buildPrisma();
    const mountedAt = new Date('2026-06-01T12:00:00.000Z');
    prisma.tire.findFirst.mockResolvedValue({
      id: 'old',
      currentPosition: TirePosition.REAR_LEFT,
    });
    prisma.tire.update.mockResolvedValue({});
    prisma.tire.create.mockResolvedValue({ id: 'new', currentPosition: TirePosition.REAR_LEFT });
    prisma.tirePositionHistory.create.mockResolvedValue({});
    prisma.tireMeasurement.create.mockResolvedValue({});

    const svc = new TireIdentityService(prisma);
    await svc.replaceAtPosition({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      position: 'RL',
      initialTreadDepthMm: 8,
      mountedAt,
      odometerKm: 12000,
    });

    expect(prisma.tire.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { active: false, dismountedAt: mountedAt },
    });
    expect(prisma.tirePositionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tireId: 'old',
          changeType: 'REPLACE',
          fromPosition: TirePosition.REAR_LEFT,
          toPosition: TirePosition.REAR_LEFT,
        }),
      }),
    );
    expect(prisma.tirePositionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tireId: 'new',
          fromPosition: null,
          toPosition: TirePosition.REAR_LEFT,
        }),
      }),
    );
  });

  it('applyRotation keeps tire IDs stable and only changes currentPosition', async () => {
    const prisma = buildPrisma();
    const tireA = { id: 'keep-a', currentPosition: TirePosition.FRONT_LEFT };
    const tireB = { id: 'keep-b', currentPosition: TirePosition.FRONT_RIGHT };
    prisma.tire.findMany
      .mockResolvedValueOnce([tireA, tireB])
      .mockResolvedValueOnce([
        { ...tireA, currentPosition: TirePosition.FRONT_RIGHT },
        { ...tireB, currentPosition: TirePosition.FRONT_LEFT },
      ]);
    prisma.tire.update.mockImplementation(({ where, data }: { where: { id: string }; data: { currentPosition: TirePosition } }) =>
      Promise.resolve({ id: where.id, currentPosition: data.currentPosition }),
    );
    prisma.tirePositionHistory.create.mockResolvedValue({});

    const svc = new TireIdentityService(prisma);
    await svc.applyRotation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      moveMap: {
        FRONT_LEFT: 'FRONT_RIGHT',
        FRONT_RIGHT: 'FRONT_LEFT',
      },
      changedAt: new Date(),
    });

    expect(prisma.tire.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'keep-a' } }),
    );
    expect(prisma.tire.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'keep-b' } }),
    );
    expect(prisma.tirePositionHistory.create).toHaveBeenCalledTimes(2);
  });

  it('applyRotation returns early when no active tires exist', async () => {
    const prisma = buildPrisma();
    prisma.tire.findMany.mockResolvedValue([]);

    const svc = new TireIdentityService(prisma);
    const result = await svc.applyRotation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetId: 'setup-1',
      moveMap: { FRONT_LEFT: 'REAR_LEFT' },
      changedAt: new Date(),
    });

    expect(result).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ensureTiresForSetup backfills four tires without crashing on empty input', async () => {
    const prisma = buildPrisma();
    prisma.tire.findMany.mockResolvedValue([]);
    prisma.tire.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `tire-${data.currentPosition}`, ...data }),
    );

    const svc = new TireIdentityService(prisma);
    const tires = await svc.ensureTiresForSetup({
      setup: {
        id: 'setup-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tireSeason: 'SUMMER',
        brandModelFront: 'Brand F',
        brandModelRear: 'Brand R',
        initialTreadFrontMm: 7.5,
        initialTreadRearMm: 7.5,
      },
    });

    expect(tires).toHaveLength(4);
    expect(prisma.tire.create).toHaveBeenCalledTimes(4);
  });
});
