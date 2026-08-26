import type { FleetMapVehicleResponse, VehicleConnectivityRuntimeState } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import {
  mapFleetMapToCanonicalVehicleOperationalView,
  mapVehicleOperationalUiProjection,
  type VehicleOperationalUiProjection,
} from './operational-projection';
import type { FleetMapVehicleRow } from './fleet-map-vehicle-mapper';

export type FleetProjectionVehicle = VehicleData &
  Pick<FleetMapVehicleRow, 'connectivityRuntime'>;

function tFor(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

/** Reconstruct a fleet-map API row from store vehicle data for P1.1 canonical mapping. */
export function vehicleDataToFleetMapResponse(
  vehicle: FleetProjectionVehicle,
): FleetMapVehicleResponse {
  const availability = vehicle.operationalAvailability;
  const health = vehicle.healthEvaluation;

  return {
    id: vehicle.id,
    licensePlate: vehicle.license || null,
    displayName: vehicle.model,
    make: vehicle.make ?? null,
    model: vehicle.model,
    year: vehicle.year ?? null,
    status: vehicle.rawVehicleStatus ?? vehicle.status,
    rawVehicleStatus: vehicle.rawVehicleStatus ?? null,
    fuelType: vehicle.fuelType,
    healthStatus: vehicle.healthStatus,
    cleaningStatus: vehicle.cleaningStatus,
    stationId: vehicle.stationId ?? null,
    stationName: (vehicle as { stationName?: string | null }).stationName ?? vehicle.station ?? null,
    homeStationId: vehicle.homeStationId ?? vehicle.stationId ?? null,
    currentStationId: vehicle.currentStationId ?? null,
    expectedStationId: vehicle.expectedStationId ?? null,
    latitude: vehicle.lat ?? null,
    longitude: vehicle.lng ?? null,
    lastSeenAt: vehicle.lastSignal || null,
    signalAgeMs: vehicle.signalAgeMs ?? 0,
    isFresh: vehicle.isFresh ?? vehicle.online,
    onlineStatus: vehicle.onlineStatus ?? 'OFFLINE',
    telemetryFreshness: vehicle.telemetryFreshness,
    displayState: vehicle.displayState ?? 'PARKED',
    displayIgnition: vehicle.displayIgnition ?? 'OFF',
    isLiveTracking: vehicle.isLiveTracking ?? false,
    heading: (vehicle as { heading?: number | null }).heading ?? null,
    imageUrl: vehicle.imageUrl ?? null,
    odometerKm: vehicle.odometerKm ?? null,
    fuelPercent: vehicle.fuelPercent ?? null,
    evSoc: vehicle.evSoc ?? null,
    isElectric: vehicle.isElectric,
    reservedBookingId: vehicle.reservedBookingId ?? null,
    reservedCustomerName: vehicle.reservedCustomerName ?? null,
    reservedPickupAt: vehicle.reservedPickupAt ?? null,
    reservedReturnAt: vehicle.reservedReturnAt ?? null,
    reservedPickupStationName: vehicle.reservedPickupStationName ?? null,
    reservedIsOverdue: vehicle.reservedIsOverdue ?? false,
    activeBookingId: vehicle.activeBookingId ?? null,
    activeCustomerName: vehicle.activeCustomerName ?? null,
    activeStartAt: vehicle.activeStartAt ?? null,
    activeReturnAt: vehicle.activeReturnAt ?? null,
    activeReturnStationName: vehicle.activeReturnStationName ?? null,
    activeKmIncluded: vehicle.activeKmIncluded ?? null,
    activeKmDriven: vehicle.activeKmDriven ?? null,
    activeIsOverdue: vehicle.activeIsOverdue ?? false,
    maintenanceReason: vehicle.maintenanceReason ?? null,
    maintenanceReasonCode: vehicle.maintenanceReasonCode ?? null,
    maintenanceUrgency: vehicle.maintenanceUrgency ?? null,
    operationalState: vehicle.operationalState ?? null,
    bookingContext: vehicle.bookingContext ?? null,
    connectivityRuntime: vehicle.connectivityRuntime as VehicleConnectivityRuntimeState | undefined,
    operationalAvailability: availability
      ? {
          state: availability.state,
          primaryReason: availability.primaryReason ?? null,
          reasonCodes: availability.reasonCodes ?? [],
          recommendedAction: availability.recommendedAction,
          attention: availability.attention,
          generatedAt: availability.generatedAt,
        }
      : undefined,
    healthEvaluation: health
      ? {
          condition: health.condition,
          evaluability: health.evaluability,
          pipelineAvailability: health.pipelineAvailability,
          generatedAt: health.generatedAt,
          healthEvidenceAt: health.healthEvidenceAt,
          anyModuleDataStale: health.anyModuleDataStale,
          source: health.source,
        }
      : undefined,
  };
}

export function buildFleetVehicleUiProjection(
  vehicle: FleetProjectionVehicle,
  options: { locale?: 'en' | 'de' } = {},
): VehicleOperationalUiProjection {
  const canonical = mapFleetMapToCanonicalVehicleOperationalView(
    vehicleDataToFleetMapResponse(vehicle),
  );
  return mapVehicleOperationalUiProjection(canonical, {
    audience: 'org_admin',
    t: tFor(options.locale ?? 'de'),
  });
}
