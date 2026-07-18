import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import {
  StationLifecycleCommandIssueCode,
  StationLifecycleCommandName,
  StationLifecycleCommandOutcome,
} from './station-lifecycle-command.types';

const ORG = 'org-lifecycle';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationsService activate/deactivate commands', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      count: jest.fn(),
    },
    vehicle: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    stationOperationsServiceMock,
    { resolveRuntimeSnapshots: jest.fn().mockResolvedValue([]) } as never,
    stationDomainAuditServiceMock as never,
  );

  const stationRow = {
    id: STATION_ID,
    organizationId: ORG,
    name: 'Zentrale',
    code: 'HQ',
    status: 'ACTIVE',
    type: 'MAIN',
    isPrimary: false,
    address: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    latitude: null,
    longitude: null,
    timezone: 'Europe/Berlin',
    radiusMeters: 100,
    phone: null,
    email: null,
    managerName: null,
    pickupEnabled: false,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: null,
    openingHours: null,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    notes: null,
    internalNotes: null,
    googlePlaceId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { vehiclesHome: 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...stationRow,
      ...data,
    }));
  });

  it('deactivates station without touching vehicles', async () => {
    const result = await service.deactivateStation(ORG, STATION_ID);

    expect(result.outcome).toBe(StationLifecycleCommandOutcome.APPLIED);
    expect(result.command).toBe(StationLifecycleCommandName.DEACTIVATE);
    expect(prisma.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'INACTIVE' },
      }),
    );
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('blocks deactivation when future pickups exist', async () => {
    (prisma.booking.count as jest.Mock)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);

    await expect(service.deactivateStation(ORG, STATION_ID)).rejects.toMatchObject({
      response: expect.objectContaining({
        blockingReasons: expect.arrayContaining([
          expect.objectContaining({
            code: StationLifecycleCommandIssueCode.FUTURE_PICKUPS_BLOCK_DEACTIVATE,
          }),
        ]),
      }),
    });
    expect(prisma.station.update).not.toHaveBeenCalled();
  });

  it('activates inactive station without enabling pickup/return', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      status: 'INACTIVE',
      pickupEnabled: false,
      returnEnabled: false,
    });

    const result = await service.activateStation(ORG, STATION_ID);

    expect(result.outcome).toBe(StationLifecycleCommandOutcome.APPLIED);
    expect(prisma.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'ACTIVE' },
      }),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationLifecycleCommandIssueCode.CAPABILITIES_UNCHANGED_ON_ACTIVATE,
        }),
      ]),
    );
  });

  it('returns idempotent outcome without update when already active', async () => {
    const result = await service.activateStation(ORG, STATION_ID);
    expect(result.outcome).toBe(StationLifecycleCommandOutcome.IDEMPOTENT);
    expect(prisma.station.update).not.toHaveBeenCalled();
    expect(result.audit.idempotent).toBe(true);
  });

  it('throws not found for cross-tenant station', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.activateStation(ORG, STATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
