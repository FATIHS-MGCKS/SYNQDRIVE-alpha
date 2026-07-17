import type { Prisma } from '@prisma/client';
import type { StationScopeMode } from './station-scope.constants';
import type { StationScopeContext } from './station-scope.types';

/**
 * Resolved station access for list/stats/nested-resource filtering.
 * `readableStationIds` / `editableStationIds`:
 * - `null` → org-wide (ALL_STATIONS, efficient — no ID materialization)
 * - `[]` → none (NO_STATIONS or missing permission)
 * - `string[]` → explicit assigned set
 */
export interface StationAccessScope {
  orgId: string;
  mode: StationScopeMode;
  /** Station IDs in membership scope (`null` = all org stations). */
  allowedStationIds: string[] | null;
  canRead: boolean;
  canWrite: boolean;
  readableStationIds: string[] | null;
  editableStationIds: string[] | null;
  fleetBooking: StationFleetBookingScope;
}

export interface StationFleetBookingScope {
  /** Stations that may surface vehicles in fleet views. */
  vehicleStationIds: string[] | null;
  /** Stations that may surface bookings in station tabs. */
  bookingStationIds: string[] | null;
}

export interface ResolveStationAccessScopeOptions {
  /** When omitted, read is assumed true (post-guard handlers). */
  canRead?: boolean;
  canWrite?: boolean;
}

export interface StationAccessScopeMembershipInput {
  orgId: string;
  scope: StationScopeContext;
  permissionsRaw?: unknown;
}

export type StationAccessWhereInput = Prisma.StationWhereInput;
export type VehicleAccessWhereInput = Prisma.VehicleWhereInput;
export type BookingAccessWhereInput = Prisma.BookingWhereInput;
