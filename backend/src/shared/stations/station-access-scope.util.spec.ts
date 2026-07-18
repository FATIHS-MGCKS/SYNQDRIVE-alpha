import { MembershipRole } from '@prisma/client';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import {
  buildBookingAccessWhere,
  buildFleetVehicleAccessWhere,
  buildStationAccessWhere,
  buildStationActivityWhere,
  buildStationBookingsWhere,
  buildStationFleetWhere,
  buildStationOpenTasksWhere,
  buildVehicleHomeAccessWhere,
  hasAnyStationsWritePermission,
  isStationReadableInAccessScope,
  resolveEmptyStationAccessScope,
  resolveStationAccessScope,
  resolveStationAccessScopeFromContext,
  resolveStationAccessScopeFromPermissions,
} from './station-access-scope.util';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('station-access-scope.util', () => {
  it('resolves ALL_STATIONS with null readable ids for efficient org queries', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ALL_STATIONS,
      allowedStationIds: null,
      bypassScope: true,
    });

    expect(access.readableStationIds).toBeNull();
    expect(access.allowedStationIds).toBeNull();
    expect(buildStationAccessWhere(access)).toEqual({ organizationId: ORG });
  });

  it('resolves ASSIGNED_STATIONS to explicit readable ids', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    expect(access.readableStationIds).toEqual([STATION_A]);
    expect(buildStationAccessWhere(access)).toEqual({
      organizationId: ORG,
      id: { in: [STATION_A] },
    });
  });

  it('returns empty readable ids for NO_STATIONS', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.NO_STATIONS,
      allowedStationIds: [],
      bypassScope: false,
    });

    expect(access.readableStationIds).toEqual([]);
    expect(buildStationAccessWhere(access)).toEqual({
      organizationId: ORG,
      id: { in: [] },
    });
  });

  it('does not treat undefined scope as org-wide access', () => {
    const access = resolveStationAccessScopeFromContext(ORG, undefined);
    expect(access.mode).toBe(STATION_SCOPE_MODE.NO_STATIONS);
    expect(access.readableStationIds).toEqual([]);
    expect(buildStationAccessWhere(access)).toEqual({
      organizationId: ORG,
      id: { in: [] },
    });
  });

  it('derives editable ids from write permissions', () => {
    const access = resolveStationAccessScopeFromPermissions(
      {
        orgId: ORG,
        mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
        allowedStationIds: [STATION_A],
        bypassScope: false,
      },
      {
        stationsV2: {
          read: true,
          update_master_data: true,
        },
      },
    );

    expect(access.canRead).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(access.editableStationIds).toEqual([STATION_A]);
  });

  it('blocks readable stations without stations.read permission', () => {
    const access = resolveStationAccessScopeFromPermissions(
      {
        orgId: ORG,
        mode: STATION_SCOPE_MODE.ALL_STATIONS,
        allowedStationIds: null,
        bypassScope: true,
      },
      { stationsV2: { read: false } },
    );

    expect(access.readableStationIds).toEqual([]);
    expect(access.editableStationIds).toEqual([]);
  });

  it('builds fleet and booking resource filters from readable scope', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A, STATION_B],
      bypassScope: false,
    });

    expect(buildVehicleHomeAccessWhere(access)).toEqual({
      organizationId: ORG,
      homeStationId: { in: [STATION_A, STATION_B] },
    });

    expect(buildFleetVehicleAccessWhere(access).OR).toEqual([
      { homeStationId: { in: [STATION_A, STATION_B] } },
      { currentStationId: { in: [STATION_A, STATION_B] } },
      { expectedStationId: { in: [STATION_A, STATION_B] } },
    ]);

    expect(buildBookingAccessWhere(access).OR).toEqual([
      { pickupStationId: { in: [STATION_A, STATION_B] } },
      { returnStationId: { in: [STATION_A, STATION_B] } },
    ]);
  });

  it('detects any write permission', () => {
    expect(
      hasAnyStationsWritePermission({
        read: true,
        create: false,
        update_master_data: false,
        manage_operations: false,
        activate: false,
        deactivate: false,
        archive: false,
        restore: false,
        set_primary: false,
        manage_home_fleet: false,
        manage_current_location: false,
        manage_transfers: false,
        manage_team: false,
        view_activity: false,
        geocode: false,
        override_rules: false,
      }),
    ).toBe(false);

    expect(
      hasAnyStationsWritePermission({
        read: true,
        create: false,
        update_master_data: true,
        manage_operations: false,
        activate: false,
        deactivate: false,
        archive: false,
        restore: false,
        set_primary: false,
        manage_home_fleet: false,
        manage_current_location: false,
        manage_transfers: false,
        manage_team: false,
        view_activity: false,
        geocode: false,
        override_rules: false,
      }),
    ).toBe(true);
  });

  it('checks station readability within access scope', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    expect(isStationReadableInAccessScope(access, STATION_A)).toBe(true);
    expect(isStationReadableInAccessScope(access, STATION_B)).toBe(false);
  });

  it('resolves empty scope helper', () => {
    const access = resolveEmptyStationAccessScope(ORG);
    expect(access.readableStationIds).toEqual([]);
    expect(access.fleetBooking.vehicleStationIds).toEqual([]);
  });

  it('builds nested fleet/booking/task filters only for readable stations', () => {
    const access = resolveStationAccessScope({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    expect(buildStationFleetWhere(access, STATION_A).OR).toHaveLength(3);
    expect(buildStationBookingsWhere(access, STATION_B)).toEqual({
      organizationId: ORG,
      id: { in: [] },
    });
    expect(
      buildStationOpenTasksWhere(access, STATION_A, ['v1'], ['b1']).OR,
    ).toEqual(
      expect.arrayContaining([
        { metadata: { path: ['stationId'], equals: STATION_A } },
        { vehicleId: { in: ['v1'] } },
        { bookingId: { in: ['b1'] } },
      ]),
    );
    expect(buildStationActivityWhere(access, STATION_A)).toEqual({
      organizationId: ORG,
      entity: 'STATION',
      entityId: STATION_A,
    });
  });
});
