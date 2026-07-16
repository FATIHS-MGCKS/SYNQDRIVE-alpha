/**
 * Compatibility layer for fleet operational status.
 * Canonical domain types live in `vehicle-operational-state/`.
 *
 * @deprecated Prefer imports from `vehicle-operational-state` for new code.
 */

import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  VEHICLE_OPERATIONAL_TAB_STATUSES,
  countVehicleOperationalTab,
  formatVehicleOperationalStatusLabel,
  formatVehicleOperationalStatusLabelFromRaw,
  isVehicleOperationalStatusAvailable,
  isVehicleOperationalStatusUnknown,
  isVehicleReadyForRent,
  normalizeVehicleOperationalStatus,
  normalizeVehicleOperationalStatusKey,
  PRISMA_TO_VEHICLE_OPERATIONAL_STATUS,
  vehicleOperationalStatusMatchesTab,
  VEHICLE_OPERATIONAL_TAB_LABEL_KEY,
  type NormalizedVehicleOperationalStatus,
  type NormalizeVehicleOperationalStatusInput,
  type VehicleDataQualityState,
  type VehicleOperationalStatus,
  type VehicleOperationalTabStatus,
} from './vehicle-operational-state';

export {
  VEHICLE_OPERATIONAL_STATUS,
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_TAB_STATUSES,
  PRISMA_TO_VEHICLE_OPERATIONAL_STATUS,
  type VehicleOperationalStatus,
  type VehicleDataQualityState,
  type VehicleOperationalTabStatus,
};

/** @deprecated Use `VehicleOperationalStatus`. */
export type FleetStatusKey = VehicleOperationalStatus;

/** @deprecated Use `VehicleDataQualityState`. */
export type FleetDataQualityState = VehicleDataQualityState;

export const CANONICAL_FLEET_STATUS_KEYS = [
  VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  VEHICLE_OPERATIONAL_STATUS.RESERVED,
  VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
  VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
] as const satisfies readonly FleetStatusKey[];

export const FLEET_STATUS_TAB_KEYS = VEHICLE_OPERATIONAL_TAB_STATUSES;

/** @deprecated Use `VehicleOperationalTabStatus`. */
export type FleetStatusTabKey = VehicleOperationalTabStatus;

/** @deprecated Use `PRISMA_TO_VEHICLE_OPERATIONAL_STATUS`. */
export const PRISMA_TO_FLEET_STATUS_KEY = PRISMA_TO_VEHICLE_OPERATIONAL_STATUS;

/** @deprecated Use `NormalizeVehicleOperationalStatusInput`. */
export type NormalizeFleetStatusInput = NormalizeVehicleOperationalStatusInput;

/** @deprecated Use `NormalizedVehicleOperationalStatus`. */
export type NormalizedFleetStatus = NormalizedVehicleOperationalStatus;

/** @deprecated Use `normalizeVehicleOperationalStatus`. */
export const normalizeFleetOperationalStatus = normalizeVehicleOperationalStatus;

/** @deprecated Use `normalizeVehicleOperationalStatusKey`. */
export const normalizeFleetStatusKey = normalizeVehicleOperationalStatusKey;

/** @deprecated Use `isVehicleOperationalStatusUnknown`. */
export const isFleetStatusUnknown = isVehicleOperationalStatusUnknown;

/** @deprecated Use `isVehicleOperationalStatusAvailable`. */
export const isFleetStatusAvailableTab = isVehicleOperationalStatusAvailable;

/** @deprecated Use `isVehicleReadyForRent`. */
export const isFleetReadyForRent = isVehicleReadyForRent;

/** @deprecated Use `VEHICLE_OPERATIONAL_TAB_LABEL_KEY`. */
export const FLEET_STATUS_LABEL_KEY = VEHICLE_OPERATIONAL_TAB_LABEL_KEY;

/** @deprecated Use `formatVehicleOperationalStatusLabel`. */
export function fleetStatusDisplayLabel(
  status: FleetStatusKey,
  locale?: string,
): string {
  const resolvedLocale = locale === 'de' || locale === 'en' ? locale : 'de';
  return formatVehicleOperationalStatusLabel(status, resolvedLocale);
}

/** @deprecated Use `formatVehicleOperationalStatusLabelFromRaw`. */
export function fleetStatusDisplayLabelFromRaw(
  raw: string | null | undefined,
  options: Omit<NormalizeFleetStatusInput, 'status'> = {},
  locale?: string,
): string {
  const resolvedLocale = locale === 'de' || locale === 'en' ? locale : 'de';
  return formatVehicleOperationalStatusLabelFromRaw(raw, options, resolvedLocale);
}

/** @deprecated Use `vehicleOperationalStatusMatchesTab`. */
export const fleetStatusMatchesTab = vehicleOperationalStatusMatchesTab;

/** @deprecated Use `countVehicleOperationalTab`. */
export const countFleetStatusTab = countVehicleOperationalTab;
