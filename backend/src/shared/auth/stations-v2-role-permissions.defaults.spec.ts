import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  STATIONS_V2_DRIVER_PERMISSIONS,
  STATIONS_V2_ORG_ADMIN_PERMISSIONS,
  STATIONS_V2_READ_ONLY_PERMISSIONS,
  STATIONS_V2_STATION_MANAGER_PERMISSIONS,
  STATIONS_V2_SUB_ADMIN_PERMISSIONS,
  STATIONS_V2_WORKER_PERMISSIONS,
} from '@shared/auth/stations-v2-role-permissions';
import {
  evaluateStationsV2Permission,
  resolveStationsV2Permissions,
} from '@shared/auth/stations-v2-permission.util';

describe('stations-v2 role defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('embeds stationsV2 in every default role template', () => {
    for (const template of DEFAULT_ORGANIZATION_ROLE_TEMPLATES) {
      const perms = template.permissions as { stationsV2?: Record<string, boolean> };
      expect(perms.stationsV2).toBeDefined();
    }
  });

  it('grants org_admin full stations v2 matrix while keeping legacy stations module', () => {
    const template = byKey('org_admin');
    const resolved = resolveStationsV2Permissions(template.permissions)!;

    expect(template.permissions.stations).toEqual({ read: true, write: true, manage: true });
    expect(resolved).toEqual(STATIONS_V2_ORG_ADMIN_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.archive')).toBe(true);
  });

  it('grants sub_admin operational stations without create, archive, or set_primary', () => {
    const resolved = resolveStationsV2Permissions(byKey('sub_admin').permissions)!;

    expect(resolved).toEqual(STATIONS_V2_SUB_ADMIN_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.create')).toBe(false);
    expect(evaluateStationsV2Permission(resolved, 'stations.manage_transfers')).toBe(true);
  });

  it('grants station_manager local ops without lifecycle admin permissions', () => {
    const resolved = resolveStationsV2Permissions(byKey('station_manager').permissions)!;

    expect(resolved).toEqual(STATIONS_V2_STATION_MANAGER_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.activate')).toBe(false);
    expect(evaluateStationsV2Permission(resolved, 'stations.manage_home_fleet')).toBe(true);
  });

  it('grants worker read and current-location management only', () => {
    const resolved = resolveStationsV2Permissions(byKey('employee').permissions)!;

    expect(resolved).toEqual(STATIONS_V2_WORKER_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.read')).toBe(true);
    expect(evaluateStationsV2Permission(resolved, 'stations.manage_current_location')).toBe(true);
    expect(evaluateStationsV2Permission(resolved, 'stations.update_master_data')).toBe(false);
  });

  it('denies driver all stations v2 permissions', () => {
    const resolved = resolveStationsV2Permissions(byKey('driver').permissions)!;

    expect(resolved).toEqual(STATIONS_V2_DRIVER_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.read')).toBe(false);
  });

  it('grants read_only read and view_activity only', () => {
    const resolved = resolveStationsV2Permissions(byKey('read_only').permissions)!;

    expect(resolved).toEqual(STATIONS_V2_READ_ONLY_PERMISSIONS);
    expect(evaluateStationsV2Permission(resolved, 'stations.view_activity')).toBe(true);
    expect(evaluateStationsV2Permission(resolved, 'stations.manage_current_location')).toBe(false);
  });
});
