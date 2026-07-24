export {
  VEHICLE_OPERATIONAL_STATUS,
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_TAB_STATUSES,
  type VehicleOperationalStatus,
  type VehicleDataQualityState,
  type VehicleOperationalState,
  type VehicleBookingReference,
  type VehicleBookingContext,
  type VehicleOperationalTabStatus,
} from './types';

export {
  PRISMA_TO_VEHICLE_OPERATIONAL_STATUS,
  normalizeVehicleOperationalStatus,
  normalizeVehicleOperationalStatusKey,
  normalizeVehicleOperationalStateDto,
  isVehicleOperationalStatusUnknown,
  isVehicleOperationalStatusAvailable,
  isVehicleReadyForRent,
  type NormalizeVehicleOperationalStatusInput,
  type NormalizedVehicleOperationalStatus,
} from './normalize';

export {
  formatVehicleOperationalStatusLabel,
  formatVehicleOperationalStatusLabelFromRaw,
  vehicleOperationalStatusMatchesTab,
  countVehicleOperationalTab,
  VEHICLE_OPERATIONAL_TAB_LABEL_KEY,
  ALL_VEHICLE_OPERATIONAL_STATUSES,
  VEHICLE_OPERATIONAL_EDIT_STATUSES,
  mapCanonicalOperationalStatusToEditStatus,
  mapVehicleOperationalEditStatusToCanonical,
  formatVehicleOperationalEditStatusLabel,
  operationalStatusToneFor,
  operationalStatusIconName,
  type VehicleOperationalDisplayLocale,
  type VehicleOperationalEditStatus,
} from './display';

export {
  selectOperationalStatus,
  selectOperationalStatusLabel,
  selectOperationalStatusReason,
  selectIsStatusReliable,
  selectIsCurrentlyAvailable,
  selectIsInPickupReservationWindow,
  selectIsCurrentlyRented,
  selectActiveBooking,
  selectReservedBooking,
  selectNextBooking,
  selectFutureBookingCount,
  selectCanBeConsideredForRentalReadiness,
  selectOperationalState,
  selectBookingContext,
  type VehicleOperationalReadModel,
} from './selectors';
