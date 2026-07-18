import { Prisma } from '@prisma/client';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import {
  StationRestoreCommandIssueCode,
  StationRestoreCommandName,
  StationRestoreCommandOutcome,
} from './station-restore-command.types';
import { StationRestorePreviewIssueCode } from './station-restore-preview.types';

const ORG = 'org-restore-cmd';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'user-restorer';

describe('StationsService restore command', () => {
  const tx = {
    station: {
      update: jest.fn(),
    },
  };

  const prisma = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
    stationOperationsServiceMock,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  const scope = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: false,
  };

  const archivedSnapshot = {
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: true,
    keyBoxAvailable: true,
    isPrimary: true,
    archivedAt: '2026-07-01T00:00:00.000Z',
    archivedByUserId: USER_ID,
    reason: 'test archive',
  };

  const stationRow = {
    id: STATION_ID,
    organizationId: ORG,
    name: 'Archiv',
    code: 'ARC',
    status: 'ARCHIVED',
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
    returnEnabled: false,
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
    archivedAt: new Date('2026-07-01T00:00:00.000Z'),
    archivedCapabilitiesSnapshot: archivedSnapshot,
    lifecycleMetadata: { lastArchivedAt: '2026-07-01T00:00:00.000Z' },
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { vehiclesHome: 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(0);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([]);
    (tx.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...stationRow,
      ...data,
      _count: { vehiclesHome: 2 },
    }));
  });

  it('returns restore preview with suggested capabilities from snapshot', async () => {
    const preview = await service.getStationRestorePreview(ORG, STATION_ID, scope);

    expect(preview.restoreAllowed).toBe(true);
    expect(preview.suggestedCapabilities).toEqual(
      expect.objectContaining({
        pickupEnabled: true,
        returnEnabled: true,
        source: 'archived_snapshot',
      }),
    );
    expect(preview.wasPrimary).toBe(true);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.WAS_PRIMARY_NOT_RESTORED,
        }),
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.MISSING_OPENING_HOURS,
        }),
      ]),
    );
  });

  it('restores station with user-confirmed capabilities without auto-enabling pickup/return', async () => {
    const result = await service.restoreStation(
      ORG,
      STATION_ID,
      { pickupEnabled: false, returnEnabled: true },
      scope,
      USER_ID,
    );

    expect(result.outcome).toBe(StationRestoreCommandOutcome.APPLIED);
    expect(result.command).toBe(StationRestoreCommandName.RESTORE);
    expect(result.station.status).toBe('ACTIVE');
    expect(result.station.pickupEnabled).toBe(false);
    expect(result.station.returnEnabled).toBe(true);
    expect(result.station.isPrimary).toBe(false);
    expect(result.audit.performedByUserId).toBe(USER_ID);
    expect(tx.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STATION_ID },
        data: expect.objectContaining({
          status: 'ACTIVE',
          isPrimary: false,
          pickupEnabled: false,
          returnEnabled: true,
          archivedCapabilitiesSnapshot: Prisma.JsonNull,
          lifecycleMetadata: expect.objectContaining({
            lastRestoredByUserId: USER_ID,
            restoredCapabilities: expect.objectContaining({
              pickupEnabled: false,
              returnEnabled: true,
            }),
          }),
        }),
      }),
    );
  });

  it('is idempotent when station is already active', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      status: 'ACTIVE',
      archivedAt: null,
      pickupEnabled: true,
      returnEnabled: true,
      archivedCapabilitiesSnapshot: null,
    });

    const result = await service.restoreStation(
      ORG,
      STATION_ID,
      { pickupEnabled: true, returnEnabled: true },
      scope,
      USER_ID,
    );

    expect(result.outcome).toBe(StationRestoreCommandOutcome.IDEMPOTENT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.station.update).not.toHaveBeenCalled();
  });

  it('blocks restore without explicit capability confirmation', async () => {
    await expect(
      service.restoreStation(ORG, STATION_ID, {} as never, scope, USER_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockingReasons: expect.arrayContaining([
          expect.objectContaining({
            code: StationRestoreCommandIssueCode.CAPABILITIES_CONFIRMATION_REQUIRED,
          }),
        ]),
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not mutate vehicle links during restore', async () => {
    (prisma.vehicle.count as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.homeStationId) return 2;
      if (where.currentStationId) return 1;
      if (where.expectedStationId) return 1;
      return 0;
    });

    await service.restoreStation(
      ORG,
      STATION_ID,
      { pickupEnabled: true, returnEnabled: true },
      scope,
      USER_ID,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.station.update).toHaveBeenCalledTimes(1);
  });

  it('warns on scoped staff in preview without auto-reactivation', async () => {
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'member-1',
        stationIds: [STATION_ID],
        stationScope: null,
        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c' },
      },
    ]);

    const preview = await service.getStationRestorePreview(ORG, STATION_ID, scope);

    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.SCOPED_STAFF_NOT_AUTO_REACTIVATED,
        }),
      ]),
    );
  });
});
