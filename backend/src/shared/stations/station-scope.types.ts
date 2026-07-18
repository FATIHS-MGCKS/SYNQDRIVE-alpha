import type { MembershipRole } from '@prisma/client';
import type { StationScopeMode } from './station-scope.constants';

export type StationScopeResourceHint =
  | 'station'
  | 'vehicle'
  | 'vehicle_location'
  | 'home_fleet_move'
  | 'booking'
  | 'list'
  | 'create'
  | 'none';

export interface StationScopeOptions {
  /**
   * How to resolve the station context for this handler.
   * - station: route/body/query station id (default)
   * - vehicle/booking: server-side resolution from nested resource
   * - list: org-wide list endpoints (no single station id)
   * - none: skip scope enforcement (e.g. Mapbox search)
   */
  resource?: StationScopeResourceHint;
  /** Override nested resource id field name (default: vehicleId / bookingId). */
  resourceIdField?: string;
  /**
   * Allow lifecycle writes (e.g. RestoreStation) on ARCHIVED stations when the
   * caller holds the matching permission (e.g. stations.restore).
   */
  allowArchivedLifecycleWrite?: boolean;
}

export interface StationScopeMembershipRecord {
  role: MembershipRole;
  stationScope: string | null;
  stationIds: unknown;
  permissions: unknown;
  /** Future DB column — when absent, derived from legacy fields. */
  stationScopeMode?: string | null;
}

export interface StationScopeContext {
  orgId: string;
  mode: StationScopeMode;
  allowedStationIds: string[] | null;
  bypassScope: boolean;
}

export interface StationScopeRequestLike {
  method: string;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  user?: {
    id?: string;
    platformRole?: string;
    organizationId?: string;
  };
  tenantId?: string;
  [key: string]: unknown;
}
