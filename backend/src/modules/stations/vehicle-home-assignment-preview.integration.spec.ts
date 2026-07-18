import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import {
  HOME_ASSIGNMENT_PREVIEW_MAX_BATCH,
  HomeAssignmentExecutableCommand,
  HomeAssignmentPreviewAction,
  HomeAssignmentPreviewIssueCode,
} from './vehicle-home-assignment-preview.types';

const ORG = 'org-home-assignment-preview';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STATION_ARCHIVED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VEHICLE_ADD = '11111111-1111-4111-8111-111111111111';
const VEHICLE_REMOVE = '22222222-2222-4222-8222-222222222222';
const VEHICLE_MOVE = '33333333-3333-4333-8333-333333333333';
const VEHICLE_UNCHANGED = '44444444-4444-4444-8444-444444444444';
const VEHICLE_BLOCKED = '55555555-5555-4555-8555-555555555555';
const FOREIGN_VEHICLE = '66666666-6666-4666-8666-666666666666';

describe('VehicleHomeAssignmentPreviewService', () => {
  const stations = new Map<string, { id: string; organizationId: string; name: string; status: string }>([
    [STATION_A, { id: STATION_A, organizationId: ORG, name: 'Station A', status: 'ACTIVE' }],
    [STATION_B, { id: STATION_B, organizationId: ORG, name: 'Station B', status: 'ACTIVE' }],
    [
      STATION_ARCHIVED,
      { id: STATION_ARCHIVED, organizationId: ORG, name: 'Archived', status: 'ARCHIVED' },
    ],
  ]);

  const vehicles = new Map<string, {
    id: string;
    organizationId: string;
    licensePlate: string;
    make: string;
    model: string;
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
    status: string;
  }>([
    [
      VEHICLE_ADD,
      {
        id: VEHICLE_ADD,
        organizationId: ORG,
        licensePlate: 'ADD 1',
        make: 'Audi',
        model: 'A4',
        homeStationId: null,
        currentStationId: null,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
    ],
    [
      VEHICLE_REMOVE,
      {
        id: VEHICLE_REMOVE,
        organizationId: ORG,
        licensePlate: 'REM 1',
        make: 'BMW',
        model: 'X3',
        homeStationId: STATION_A,
        currentStationId: STATION_B,
        expectedStationId: STATION_A,
        status: 'RENTED',
      },
    ],
    [
      VEHICLE_MOVE,
      {
        id: VEHICLE_MOVE,
        organizationId: ORG,
        licensePlate: 'MOV 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: STATION_B,
        currentStationId: STATION_B,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
    ],
    [
      VEHICLE_UNCHANGED,
      {
        id: VEHICLE_UNCHANGED,
        organizationId: ORG,
        licensePlate: 'SAME 1',
        make: 'VW',
        model: 'Polo',
        homeStationId: STATION_A,
        currentStationId: STATION_A,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
    ],
    [
      VEHICLE_BLOCKED,
      {
        id: VEHICLE_BLOCKED,
        organizationId: ORG,
        licensePlate: 'BLK 1',
        make: 'Seat',
        model: 'Leon',
        homeStationId: null,
        currentStationId: null,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
    ],
  ]);

  const prisma = {
    station: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) => {
        const station = where.id ? stations.get(where.id) : undefined;
        if (!station) return null;
        if (where.organizationId && station.organizationId !== where.organizationId) return null;
        return station;
      }),
      findMany: jest.fn(async ({ where }: { where: { organizationId: string; id?: { in: string[] } } }) => {
        const ids = where.id?.in ?? [];
        return ids
          .map((id) => stations.get(id))
          .filter((station): station is NonNullable<typeof station> => {
            return !!station && station.organizationId === where.organizationId;
          })
          .map((station) => ({
            id: station.id,
            name: station.name,
            status: station.status,
          }));
      }),
    },
    vehicle: {
      findMany: jest.fn(async ({ where }: { where: { organizationId: string; id?: { in: string[] } } }) => {
        const ids = where.id?.in ?? [];
        return ids
          .map((id) => vehicles.get(id))
          .filter((vehicle): vehicle is NonNullable<typeof vehicle> => {
            return !!vehicle && vehicle.organizationId === where.organizationId;
          })
          .map((vehicle) => ({
            id: vehicle.id,
            licensePlate: vehicle.licensePlate,
            make: vehicle.make,
            model: vehicle.model,
            homeStationId: vehicle.homeStationId,
            currentStationId: vehicle.currentStationId,
            expectedStationId: vehicle.expectedStationId,
            status: vehicle.status,
          }));
      }),
    },
  } as unknown as PrismaService;

  const service = new VehicleHomeAssignmentPreviewService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews mixed fleet changes without mutating data', async () => {
    const result = await service.previewHomeAssignment(ORG, STATION_A, [
      { vehicleId: VEHICLE_ADD, desiredHomeStationId: STATION_A },
      { vehicleId: VEHICLE_REMOVE, desiredHomeStationId: null },
      { vehicleId: VEHICLE_MOVE, desiredHomeStationId: STATION_A },
      { vehicleId: VEHICLE_UNCHANGED, desiredHomeStationId: STATION_A },
      { vehicleId: VEHICLE_BLOCKED, desiredHomeStationId: STATION_ARCHIVED },
      { vehicleId: FOREIGN_VEHICLE, desiredHomeStationId: STATION_A },
    ]);

    expect(result.contextStationId).toBe(STATION_A);
    expect(result.summary).toEqual({
      requested: 6,
      evaluated: 6,
      toAdd: 2,
      toRemove: 1,
      toMove: 0,
      unchanged: 1,
      blocked: 2,
    });
    expect(result.batch).toEqual({
      limit: HOME_ASSIGNMENT_PREVIEW_MAX_BATCH,
      requested: 6,
      evaluated: 6,
      truncated: false,
      duplicateVehicleIdsIgnored: 0,
    });

    const addItem = result.items.find((item) => item.vehicleId === VEHICLE_ADD)!;
    expect(addItem.action).toBe(HomeAssignmentPreviewAction.ADD);
    expect(addItem.executableCommand).toBe(HomeAssignmentExecutableCommand.ADD);
    expect(addItem.currentPhysicalStation).toBeNull();
    expect(addItem.expectedStation).toBeNull();

    const removeItem = result.items.find((item) => item.vehicleId === VEHICLE_REMOVE)!;
    expect(removeItem.action).toBe(HomeAssignmentPreviewAction.REMOVE);
    expect(removeItem.rentalStatus).toBe('RENTED');
    expect(removeItem.activeTransfer?.toStationName).toBe('Station A');
    expect(removeItem.warnings.some((w) => w.code === HomeAssignmentPreviewIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING)).toBe(true);

    const moveItem = result.items.find((item) => item.vehicleId === VEHICLE_MOVE)!;
    expect(moveItem.action).toBe(HomeAssignmentPreviewAction.MOVE);
    expect(moveItem.moveFromStationId).toBe(STATION_B);
    expect(moveItem.moveToStationId).toBe(STATION_A);

    const unchangedItem = result.items.find((item) => item.vehicleId === VEHICLE_UNCHANGED)!;
    expect(unchangedItem.action).toBe(HomeAssignmentPreviewAction.UNCHANGED);

    const blockedItem = result.items.find((item) => item.vehicleId === VEHICLE_BLOCKED)!;
    expect(blockedItem.action).toBe(HomeAssignmentPreviewAction.BLOCKED);
    expect(blockedItem.conflicts[0]?.code).toBe(HomeAssignmentPreviewIssueCode.STATION_ARCHIVED);

    const foreignItem = result.items.find((item) => item.vehicleId === FOREIGN_VEHICLE)!;
    expect(foreignItem.action).toBe(HomeAssignmentPreviewAction.BLOCKED);
    expect(foreignItem.conflicts[0]?.code).toBe(HomeAssignmentPreviewIssueCode.VEHICLE_NOT_FOUND);

    expect(vehicles.get(VEHICLE_ADD)?.homeStationId).toBeNull();
    expect(vehicles.get(VEHICLE_REMOVE)?.homeStationId).toBe(STATION_A);
  });

  it('rejects batches above the explicit limit instead of silently truncating', async () => {
    const proposals = Array.from({ length: HOME_ASSIGNMENT_PREVIEW_MAX_BATCH + 1 }, (_, index) => ({
      vehicleId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      desiredHomeStationId: STATION_A,
    }));

    await expect(service.previewHomeAssignment(ORG, STATION_A, proposals)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('dedupes duplicate vehicle proposals and reports ignored duplicates', async () => {
    const result = await service.previewHomeAssignment(ORG, STATION_A, [
      { vehicleId: VEHICLE_ADD, desiredHomeStationId: STATION_A },
      { vehicleId: VEHICLE_ADD, desiredHomeStationId: STATION_B },
    ]);

    expect(result.batch.duplicateVehicleIdsIgnored).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.summary.evaluated).toBe(1);
    expect(result.summary.requested).toBe(2);
  });

  it('returns 404 when context station is missing', async () => {
    await expect(
      service.previewHomeAssignment(ORG, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', [
        { vehicleId: VEHICLE_ADD, desiredHomeStationId: STATION_A },
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
