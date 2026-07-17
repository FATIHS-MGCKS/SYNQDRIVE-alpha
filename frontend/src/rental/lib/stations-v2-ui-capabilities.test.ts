import { describe, expect, it } from 'vitest';
import { buildStationsV2Permissions } from '../../lib/stations-v2-permissions';
import {
  STATIONS_V2_ORG_ADMIN_PERMISSIONS,
  STATIONS_V2_READ_ONLY_PERMISSIONS,
  STATIONS_V2_WORKER_PERMISSIONS,
} from './stations-v2-role-fixtures';
import { getStationsFormCapabilities, getStationsUiCapabilities } from './stations-v2-ui-capabilities';

describe('stations-v2-ui-capabilities', () => {
  it('grants org admin full write capabilities', () => {
    const caps = getStationsUiCapabilities(STATIONS_V2_ORG_ADMIN_PERMISSIONS, { userRole: 'ORG_ADMIN' });
    expect(caps.canRead).toBe(true);
    expect(caps.canCreate).toBe(true);
    expect(caps.canArchive).toBe(true);
    expect(caps.canSetPrimary).toBe(true);
    expect(caps.isReadOnly).toBe(false);
  });

  it('marks read-only users as read-only without write actions', () => {
    const caps = getStationsUiCapabilities(STATIONS_V2_READ_ONLY_PERMISSIONS);
    expect(caps.canRead).toBe(true);
    expect(caps.canViewActivity).toBe(true);
    expect(caps.canCreate).toBe(false);
    expect(caps.isReadOnly).toBe(true);
    expect(caps.hasAnyWrite).toBe(false);
  });

  it('blocks worker from set_primary even when flag is set', () => {
    const perms = buildStationsV2Permissions({ read: true, set_primary: true });
    const caps = getStationsUiCapabilities(perms, { userRole: 'WORKER' });
    expect(caps.canSetPrimary).toBe(false);
  });

  it('reduces archived station actions to read, restore, and activity', () => {
    const caps = getStationsUiCapabilities(STATIONS_V2_ORG_ADMIN_PERMISSIONS, {
      station: { status: 'ARCHIVED' },
    });
    expect(caps.canRead).toBe(true);
    expect(caps.canRestore).toBe(true);
    expect(caps.canViewActivity).toBe(true);
    expect(caps.canEditMasterData).toBe(false);
    expect(caps.canArchive).toBe(false);
    expect(caps.canManageHomeFleet).toBe(false);
  });

  it('denies all capabilities when permissions are null', () => {
    const caps = getStationsUiCapabilities(null);
    expect(caps.canRead).toBe(false);
    expect(caps.canCreate).toBe(false);
  });

  it('allows worker current-location on active stations without master-data write', () => {
    const caps = getStationsUiCapabilities(STATIONS_V2_WORKER_PERMISSIONS, { userRole: 'WORKER' });
    expect(caps.canManageCurrentLocation).toBe(true);
    expect(caps.canEditMasterData).toBe(false);
    expect(caps.hasAnyWrite).toBe(true);
    expect(caps.isReadOnly).toBe(false);
  });

  it('builds form capabilities for create vs edit', () => {
    const createCaps = getStationsFormCapabilities(STATIONS_V2_ORG_ADMIN_PERMISSIONS, { isCreate: true });
    expect(createCaps.canSubmit).toBe(true);
    expect(createCaps.canEditMasterData).toBe(true);

    const readOnlyForm = getStationsFormCapabilities(STATIONS_V2_READ_ONLY_PERMISSIONS, { isCreate: false });
    expect(readOnlyForm.readOnly).toBe(true);
    expect(readOnlyForm.canSubmit).toBe(false);
  });
});
