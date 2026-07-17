import { useMemo } from 'react';
import type { Station } from '../../lib/api';
import {
  evaluateStationsV2Permission,
  resolveStationsV2Permissions,
  type StationsV2PermissionAction,
  type StationsV2PermissionsMap,
} from '../../lib/stations-v2-permissions';
import { useRentalOrg } from '../RentalContext';
import {
  getStationsFormCapabilities,
  getStationsUiCapabilities,
  type StationsFormCapabilities,
  type StationsUiCapabilities,
} from '../lib/stations-v2-ui-capabilities';

export type StationsV2PermissionsStatus = 'loading' | 'ready';

export type UseStationsV2PermissionsResult = {
  status: StationsV2PermissionsStatus;
  permissions: StationsV2PermissionsMap | null;
  can: (action: StationsV2PermissionAction) => boolean;
  capabilities: StationsUiCapabilities;
  formCapabilities: (station?: Pick<Station, 'status'> | null, isCreate?: boolean) => StationsFormCapabilities;
  forStation: (station?: Pick<Station, 'status'> | null) => StationsUiCapabilities;
  canRead: boolean;
  isReadOnly: boolean;
};

/**
 * Resolve canonical Stations V2 permissions for the current rental org user.
 * Never grants access on load failure or missing data — deny by default.
 */
export function useStationsV2Permissions(): UseStationsV2PermissionsResult {
  const { loading, userPermissions, userRole } = useRentalOrg();

  const permissions = useMemo(() => {
    if (loading) return null;
    return resolveStationsV2Permissions(userPermissions);
  }, [loading, userPermissions]);

  const capabilities = useMemo(
    () => getStationsUiCapabilities(permissions, { userRole }),
    [permissions, userRole],
  );

  const can = useMemo(
    () => (action: StationsV2PermissionAction) => evaluateStationsV2Permission(permissions, action),
    [permissions],
  );

  const forStation = useMemo(
    () => (station?: Pick<Station, 'status'> | null) =>
      getStationsUiCapabilities(permissions, { station, userRole }),
    [permissions, userRole],
  );

  const formCapabilities = useMemo(
    () => (station?: Pick<Station, 'status'> | null, isCreate?: boolean) =>
      getStationsFormCapabilities(permissions, { station, isCreate, userRole }),
    [permissions, userRole],
  );

  return {
    status: loading ? 'loading' : 'ready',
    permissions,
    can,
    capabilities,
    formCapabilities,
    forStation,
    canRead: capabilities.canRead,
    isReadOnly: capabilities.isReadOnly,
  };
}
