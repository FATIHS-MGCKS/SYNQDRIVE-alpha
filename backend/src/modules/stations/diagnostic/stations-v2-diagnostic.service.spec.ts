import { StationStatus } from '@prisma/client';
import { StationsV2DiagnosticService } from './stations-v2-diagnostic.service';

const NOW = new Date('2026-07-18T10:00:00.000Z');

function station(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sta-1',
    organizationId: 'org-1',
    name: 'Main',
    status: StationStatus.ACTIVE,
    isPrimary: true,
    latitude: 52.5,
    longitude: 13.4,
    timezone: 'Europe/Berlin',
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: null,
    openingHours: null,
    holidayRules: null,
    ...overrides,
  };
}

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh-1',
    organizationId: 'org-1',
    homeStationId: 'sta-1',
    currentStationId: 'sta-1',
    expectedStationId: null,
    currentStationSource: null,
    expectedStationSource: null,
    expectedStationSetAt: null,
    ...overrides,
  };
}

describe('StationsV2DiagnosticService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    station: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    organizationMembership: { findMany: jest.fn() },
    organizationRole: { findMany: jest.fn() },
    userAccountPreference: { findMany: jest.fn() },
    vehicleStationTransfer: { findMany: jest.fn() },
  };

  let service: StationsV2DiagnosticService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prisma.station.findMany.mockResolvedValue([station()]);
    prisma.vehicle.findMany.mockResolvedValue([vehicle()]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.organizationMembership.findMany.mockResolvedValue([]);
    prisma.organizationRole.findMany.mockResolvedValue([]);
    prisma.userAccountPreference.findMany.mockResolvedValue([]);
    prisma.vehicleStationTransfer.findMany.mockResolvedValue([]);
    service = new StationsV2DiagnosticService(prisma as any);
  });

  it('flags multiple primary stations', async () => {
    prisma.station.findMany.mockResolvedValue([
      station({ id: 'sta-1', isPrimary: true }),
      station({ id: 'sta-2', isPrimary: true, name: 'Branch' }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.primary_multiple).toBe(2);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it('flags archived station with active capabilities', async () => {
    prisma.station.findMany.mockResolvedValue([
      station({
        status: StationStatus.ARCHIVED,
        isPrimary: false,
        pickupEnabled: true,
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.archived_active_capabilities).toBe(1);
  });

  it('flags current station without source and home/current coupling', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      vehicle({ currentStationSource: null, homeStationId: 'sta-1', currentStationId: 'sta-1' }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.current_without_source).toBe(1);
    expect(report.summary.byCheck.home_current_coupling_suspect).toBe(1);
  });

  it('flags expected station without provenance', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      vehicle({
        expectedStationId: 'sta-1',
        expectedStationSource: null,
        expectedStationSetAt: null,
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.expected_without_valid_context).toBe(1);
  });

  it('flags stale scope station IDs on membership', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'mem-1',
        stationIds: ['00000000-0000-4000-8000-000000000099'],
        stationScope: null,
      },
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.stale_scope_station_ids).toBe(1);
  });

  it('masks IDs in org summary', async () => {
    prisma.organization.findMany.mockResolvedValue([
      { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    ]);
    prisma.station.findMany.mockResolvedValue([
      station({
        id: '11111111-2222-3333-4444-555555555551',
        organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        isPrimary: true,
      }),
      station({
        id: '11111111-2222-3333-4444-555555555552',
        organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        isPrimary: true,
        name: 'Branch',
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      referenceNow: NOW,
    });

    expect(report.byOrganization[0]?.organizationId).toMatch(/^aaaa…eeee$/);
    expect(report.checks[0]?.sampleStationIds[0]).toMatch(/^1111…5551$/);
  });
});
