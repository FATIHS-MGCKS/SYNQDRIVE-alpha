import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationVehicleWorkflowLookupService } from './station-vehicle-workflow-lookup.service';
import { StationVehicleWorkflowPreviewService } from './station-vehicle-workflow-preview.service';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import { StationVehicleWorkflowType } from '@shared/stations/station-vehicle-workflow.contract';

const ORG = 'org-vehicle-workflow';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Station vehicle workflow services', () => {
  const prisma = {
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    station: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const stationAccessScope = {
    resolveFromContextOrEmpty: jest.fn(() => ({
      orgId: ORG,
      fleetBooking: { vehicleStationIds: null },
    })),
    requireReadableStation: jest.fn(),
    buildFleetVehicleWhere: jest.fn(() => ({ organizationId: ORG })),
  };

  let lookup: StationVehicleWorkflowLookupService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StationVehicleWorkflowLookupService,
        { provide: PrismaService, useValue: prisma },
        { provide: StationAccessScopeService, useValue: stationAccessScope },
      ],
    }).compile();

    lookup = moduleRef.get(StationVehicleWorkflowLookupService);
  });

  it('returns paginated workflow vehicle lookup without client-side cap', async () => {
    prisma.vehicle.count.mockResolvedValue(1200);
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: VEHICLE_1,
        licensePlate: 'M-AB 123',
        make: 'VW',
        model: 'Golf',
        vehicleName: null,
        status: 'AVAILABLE',
        homeStationId: STATION_A,
        currentStationId: STATION_B,
        expectedStationId: null,
        stationPositionVersion: 3,
      },
    ]);
    prisma.station.findMany.mockResolvedValue([
      { id: STATION_A, name: 'Station A', code: 'A', status: 'ACTIVE' },
      { id: STATION_B, name: 'Station B', code: 'B', status: 'ACTIVE' },
    ]);

    const result = await lookup.lookupVehicles(ORG, {
      contextStationId: STATION_A,
      search: 'golf',
      page: 2,
      pageSize: 25,
    });

    expect(result.pagination.total).toBe(1200);
    expect(result.pagination.page).toBe(2);
    expect(result.vehicles[0].homeStation?.name).toBe('Station A');
    expect(result.vehicles[0].currentStation?.name).toBe('Station B');
    expect(result.frontendRecomputation).toBe(false);
  });
});

describe('StationVehicleWorkflowPreviewService', () => {
  const homeAssignmentPreview = {
    previewHomeAssignment: jest.fn(),
  };
  const transferService = {
    evaluatePlanTransfer: jest.fn(),
  };
  const lookup = {
    requireVehicleInScope: jest.fn(),
  };
  const prisma = {
    station: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const stationAccessScope = {
    resolveFromContextOrEmpty: jest.fn(() => ({ orgId: ORG })),
    requireReadableStation: jest.fn(),
  };

  let previewService: StationVehicleWorkflowPreviewService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StationVehicleWorkflowPreviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: StationAccessScopeService, useValue: stationAccessScope },
        { provide: StationVehicleWorkflowLookupService, useValue: lookup },
        { provide: VehicleHomeAssignmentPreviewService, useValue: homeAssignmentPreview },
        { provide: VehicleStationTransferService, useValue: transferService },
      ],
    }).compile();

    previewService = moduleRef.get(StationVehicleWorkflowPreviewService);
  });

  it('previews remove home via home assignment preview', async () => {
    homeAssignmentPreview.previewHomeAssignment.mockResolvedValue({
      items: [
        {
          vehicleId: VEHICLE_1,
          licensePlate: 'M-AB 123',
          vehicleLabel: 'VW Golf',
          rentalStatus: 'RENTED',
          currentHomeStation: { id: STATION_A, name: 'Station A', status: 'ACTIVE' },
          desiredHomeStation: null,
          currentPhysicalStation: { id: STATION_B, name: 'Station B', status: 'ACTIVE' },
          expectedStation: null,
          action: 'REMOVE',
          warnings: [{ code: 'VEHICLE_RENTED_HOME_CHANGE_WARNING', message: 'warn' }],
          conflicts: [],
          concurrency: { stationPositionVersion: 4 },
        },
      ],
    });

    const result = await previewService.preview(ORG, {
      workflow: StationVehicleWorkflowType.REMOVE_HOME,
      vehicleId: VEHICLE_1,
      contextStationId: STATION_A,
    });

    expect(result.workflow).toBe(StationVehicleWorkflowType.REMOVE_HOME);
    expect(result.from.homeStation?.id).toBe(STATION_A);
    expect(result.to.homeStation).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.concurrency.stationPositionVersion).toBe(4);
  });
});
