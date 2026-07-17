import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import {
  StationSetPrimaryCommandIssueCode,
  StationSetPrimaryCommandName,
  StationSetPrimaryCommandOutcome,
} from './station-set-primary-command.types';
import { STATION_PRIMARY_UNIQUE_INDEX } from './station-set-primary-command.util';

const ORG = 'org-set-primary';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'user-primary';

describe('StationsService set-primary command', () => {
  const tx = {
    $executeRaw: jest.fn(),
    station: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const prisma = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
  );

  const scope = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: false,
  };

  const stationRow = (overrides: Record<string, unknown> = {}) => ({
    id: STATION_A,
    organizationId: ORG,
    name: 'Zentrale',
    code: 'HQ',
    status: 'ACTIVE',
    type: 'MAIN',
    isPrimary: false,
    pickupEnabled: true,
    returnEnabled: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date(),
    _count: { vehiclesHome: 0 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow());
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
    (tx.$executeRaw as jest.Mock).mockResolvedValue(1);
    (tx.station.findMany as jest.Mock).mockResolvedValue([{ id: STATION_B }]);
    (tx.station.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (tx.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...stationRow(),
      ...data,
    }));
  });

  it('sets primary with org advisory lock and demotes previous primary', async () => {
    const result = await service.setPrimaryStation(ORG, STATION_A, USER_ID);

    expect(result.outcome).toBe(StationSetPrimaryCommandOutcome.APPLIED);
    expect(result.command).toBe(StationSetPrimaryCommandName.SET_PRIMARY);
    expect(result.station.isPrimary).toBe(true);
    expect(result.audit.demotedPrimaryStationIds).toEqual([STATION_B]);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.station.updateMany).toHaveBeenCalled();
    expect(tx.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STATION_A },
        data: { isPrimary: true, status: 'ACTIVE' },
      }),
    );
  });

  it('is idempotent when station is already sole primary', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(
      stationRow({ isPrimary: true }),
    );
    (prisma.station.findMany as jest.Mock).mockResolvedValue([{ id: STATION_A }]);

    const result = await service.setPrimaryStation(ORG, STATION_A, USER_ID);

    expect(result.outcome).toBe(StationSetPrimaryCommandOutcome.IDEMPOTENT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks set-primary on inactive station', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(
      stationRow({ status: 'INACTIVE' }),
    );

    await expect(service.setPrimaryStation(ORG, STATION_A, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps unique-index race to conflict response', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [STATION_PRIMARY_UNIQUE_INDEX] },
      }),
    );

    await expect(service.setPrimaryStation(ORG, STATION_A, USER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationSetPrimaryCommandIssueCode.PRIMARY_CONFLICT,
      }),
    });
    await expect(service.setPrimaryStation(ORG, STATION_A, USER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('StationsService set-primary concurrency', () => {
  it('serializes concurrent set-primary attempts via advisory lock callback order', async () => {
    const lockOrder: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => {
        lockOrder.push('lock');
        return 1;
      }),
      station: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockImplementation(async ({ where }) => {
          lockOrder.push(`update:${where.id}`);
          return {
            id: where.id,
            organizationId: ORG,
            status: 'ACTIVE',
            isPrimary: true,
            _count: { vehiclesHome: 0 },
          };
        }),
      },
    };

    const prisma = {
      station: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          organizationId: ORG,
          status: 'ACTIVE',
          isPrimary: false,
          pickupEnabled: true,
          returnEnabled: true,
          archivedAt: null,
          _count: { vehiclesHome: 0 },
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as PrismaService;

    const service = new StationsService(
      prisma,
      {} as StationValidationService,
      new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    );

    await Promise.all([
      service.setPrimaryStation(ORG, STATION_A),
      service.setPrimaryStation(ORG, STATION_B),
    ]);

    expect(lockOrder.filter((entry) => entry === 'lock')).toHaveLength(2);
    expect(lockOrder).toEqual(
      expect.arrayContaining([`update:${STATION_A}`, `update:${STATION_B}`]),
    );
  });
});
