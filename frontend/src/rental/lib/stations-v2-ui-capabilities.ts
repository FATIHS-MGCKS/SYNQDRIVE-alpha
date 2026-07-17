import type { Station } from '../../lib/api';
import {
  evaluateStationsV2Permission,
  hasAnyStationsWritePermission,
  type StationsV2PermissionAction,
  type StationsV2PermissionsMap,
} from '../../lib/stations-v2-permissions';

const WRITE_ACTION_KEYS = [
  'create',
  'update_master_data',
  'manage_operations',
  'activate',
  'deactivate',
  'archive',
  'restore',
  'set_primary',
  'manage_home_fleet',
  'manage_current_location',
  'manage_transfers',
  'manage_team',
  'geocode',
] as const;

export type StationsUiCapabilities = {
  canRead: boolean;
  canCreate: boolean;
  canEditMasterData: boolean;
  canManageOperations: boolean;
  canActivate: boolean;
  canDeactivate: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canSetPrimary: boolean;
  canManageHomeFleet: boolean;
  canManageCurrentLocation: boolean;
  canManageTransfers: boolean;
  canManageTeam: boolean;
  canViewActivity: boolean;
  canGeocode: boolean;
  isReadOnly: boolean;
  hasAnyWrite: boolean;
};

export type StationsFormCapabilities = {
  canSubmit: boolean;
  canEditMasterData: boolean;
  canManageOperations: boolean;
  canManageTeam: boolean;
  canChangeStatus: boolean;
  canUseMapboxSearch: boolean;
  readOnly: boolean;
};

const DENIED_CAPABILITIES: StationsUiCapabilities = {
  canRead: false,
  canCreate: false,
  canEditMasterData: false,
  canManageOperations: false,
  canActivate: false,
  canDeactivate: false,
  canArchive: false,
  canRestore: false,
  canSetPrimary: false,
  canManageHomeFleet: false,
  canManageCurrentLocation: false,
  canManageTransfers: false,
  canManageTeam: false,
  canViewActivity: false,
  canGeocode: false,
  isReadOnly: false,
  hasAnyWrite: false,
};

function can(permissions: StationsV2PermissionsMap | null, action: StationsV2PermissionAction): boolean {
  return evaluateStationsV2Permission(permissions, action);
}

function isArchivedStation(station?: Pick<Station, 'status'> | null): boolean {
  return station?.status === 'ARCHIVED';
}

function isSetPrimaryRoleAllowed(userRole: string | null | undefined): boolean {
  if (!userRole) return true;
  const normalized = userRole.toUpperCase();
  return normalized !== 'WORKER' && normalized !== 'DRIVER';
}

/**
 * Compute UI capabilities for a station context.
 * Archived stations expose only read + restore (when permitted).
 */
export function getStationsUiCapabilities(
  permissions: StationsV2PermissionsMap | null,
  options?: {
    station?: Pick<Station, 'status'> | null;
    userRole?: string | null;
  },
): StationsUiCapabilities {
  if (!permissions) return DENIED_CAPABILITIES;

  const archived = isArchivedStation(options?.station);
  const setPrimaryAllowed = isSetPrimaryRoleAllowed(options?.userRole);

  if (archived) {
    const canRead = can(permissions, 'stations.read');
    return {
      canRead,
      canCreate: false,
      canEditMasterData: false,
      canManageOperations: false,
      canActivate: false,
      canDeactivate: false,
      canArchive: false,
      canRestore: can(permissions, 'stations.restore'),
      canSetPrimary: false,
      canManageHomeFleet: false,
      canManageCurrentLocation: false,
      canManageTransfers: false,
      canManageTeam: false,
      canViewActivity: can(permissions, 'stations.view_activity'),
      canGeocode: false,
      isReadOnly: canRead,
      hasAnyWrite: can(permissions, 'stations.restore'),
    };
  }

  const base: StationsUiCapabilities = {
    canRead: can(permissions, 'stations.read'),
    canCreate: can(permissions, 'stations.create'),
    canEditMasterData: can(permissions, 'stations.update_master_data'),
    canManageOperations: can(permissions, 'stations.manage_operations'),
    canActivate: can(permissions, 'stations.activate'),
    canDeactivate: can(permissions, 'stations.deactivate'),
    canArchive: can(permissions, 'stations.archive'),
    canRestore: can(permissions, 'stations.restore'),
    canSetPrimary: can(permissions, 'stations.set_primary') && setPrimaryAllowed,
    canManageHomeFleet: can(permissions, 'stations.manage_home_fleet'),
    canManageCurrentLocation: can(permissions, 'stations.manage_current_location'),
    canManageTransfers: can(permissions, 'stations.manage_transfers'),
    canManageTeam: can(permissions, 'stations.manage_team'),
    canViewActivity: can(permissions, 'stations.view_activity'),
    canGeocode: can(permissions, 'stations.geocode'),
    isReadOnly: false,
    hasAnyWrite: false,
  };

  base.isReadOnly = base.canRead && !hasAnyStationsWritePermission(permissions);
  base.hasAnyWrite = WRITE_ACTION_KEYS.some((key) => permissions[key]);
  return base;
}

export function getStationsFormCapabilities(
  permissions: StationsV2PermissionsMap | null,
  options?: {
    station?: Pick<Station, 'status'> | null;
    isCreate?: boolean;
    userRole?: string | null;
  },
): StationsFormCapabilities {
  const ui = getStationsUiCapabilities(permissions, options);
  const isCreate = options?.isCreate === true;

  if (isArchivedStation(options?.station)) {
    return {
      canSubmit: false,
      canEditMasterData: false,
      canManageOperations: false,
      canManageTeam: false,
      canChangeStatus: false,
      canUseMapboxSearch: false,
      readOnly: true,
    };
  }

  const canSubmit = isCreate ? ui.canCreate : (ui.canEditMasterData || ui.canManageOperations || ui.canManageTeam);
  const canUseMapboxSearch = ui.canRead && (isCreate ? ui.canCreate : ui.canEditMasterData);

  return {
    canSubmit,
    canEditMasterData: isCreate ? ui.canCreate : ui.canEditMasterData,
    canManageOperations: isCreate ? ui.canCreate : ui.canManageOperations,
    canManageTeam: isCreate ? ui.canCreate : ui.canManageTeam,
    canChangeStatus: ui.canActivate || ui.canDeactivate,
    canUseMapboxSearch,
    readOnly: !canSubmit,
  };
}

export function canChangeStationStatus(
  permissions: StationsV2PermissionsMap | null,
  nextStatus: Station['status'],
): boolean {
  if (!permissions) return false;
  if (nextStatus === 'ACTIVE') return can(permissions, 'stations.activate') || can(permissions, 'stations.restore');
  if (nextStatus === 'INACTIVE') return can(permissions, 'stations.deactivate');
  if (nextStatus === 'ARCHIVED') return can(permissions, 'stations.archive');
  return false;
}
