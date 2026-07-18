import { BadRequestException, ConflictException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';

const ORG = 'org-create';
const OTHER_ORG = 'org-other';

describe('StationsService create hardening', () => {
  const txStation = {
    updateMany: jest.fn(),
    create: jest.fn(),
  };
  const tx = {
    station: txStation,
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const prisma = {
    station: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const stationValidation = {} as StationValidationService;
  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationsService(
    prisma,
    stationValidation,
    stationAccessScope,
    stationOperationsServiceMock,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  const createdRow = {
    id: 'station-new',
    organizationId: ORG,
    name: 'Neue Station',
    code: 'N-01',
    status: 'ACTIVE',
    type: 'BRANCH',
    isPrimary: false,
    address: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfirmedAt: null,
    timezone: 'Europe/Berlin',
    radiusMeters: 100,
    phone: null,
    email: null,
    managerName: null,
    pickupEnabled: true,
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
    _count: { vehiclesHome: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);
    txStation.create.mockResolvedValue(createdRow);
  });

  it('rejects client organizationId override in payload', async () => {
    await expect(
      service.create(ORG, {
        name: 'Neue Station',
        code: 'N-01',
        organizationId: OTHER_ORG,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txStation.create).not.toHaveBeenCalled();
  });

  it('creates station connected to route organization', async () => {
    const result = await service.create(ORG, {
      name: 'Neue Station',
      code: 'N-01',
    });

    expect(result.name).toBe('Neue Station');
    expect(txStation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Neue Station',
          organization: { connect: { id: ORG } },
        }),
      }),
    );
  });

  it('rejects ARCHIVED status on create', async () => {
    await expect(
      service.create(ORG, { name: 'Archived', status: 'ARCHIVED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txStation.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate code within organization', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(ORG, { name: 'Dup', code: 'N-01' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects partial coordinates', async () => {
    await expect(
      service.create(ORG, { name: 'Geo', latitude: 52.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears other primaries in transaction when isPrimary is true', async () => {
    txStation.create.mockResolvedValue({ ...createdRow, isPrimary: true });

    await service.create(ORG, { name: 'Haupt', isPrimary: true });

    expect(txStation.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, isPrimary: true },
      data: { isPrimary: false },
    });
  });

  it('rejects primary create with INACTIVE status', async () => {
    await expect(
      service.create(ORG, { name: 'Primary', isPrimary: true, status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
