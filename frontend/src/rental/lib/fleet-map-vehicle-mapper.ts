import type { FleetMapVehicleResponse } from '../../lib/api';
import type {
  FleetMaintenanceReasonCode,
  VehicleData,
  VehicleDisplayIgnition,
  VehicleDisplayState,
  VehicleOnlineStatus,
} from '../data/vehicles';
import {
  normalizeVehicleOperationalStateDto,
  type VehicleBookingContext,
  type VehicleBookingReference,
  type VehicleOperationalState,
} from './vehicle-operational-state';

/** Fleet map row after canonical DTO mapping — extends rental vehicle read-model. */
export interface FleetMapVehicleRow extends VehicleData {
  rawVehicleStatus: string;
  operationalState: VehicleOperationalState;
  bookingContext: VehicleBookingContext;
  dataQualityReasons: string[];
  stationId: string | null;
  stationName: string | null;
  heading: number | null;
  lastSeenAt: string | null;
  connectivityRuntime?: import('../../lib/api').VehicleConnectivityRuntimeState;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function normalizeFuelType(raw: string | null | undefined): VehicleData['fuelType'] {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('diesel')) return 'Diesel';
  if (value.includes('electric')) return 'Electric';
  if (value.includes('plugin') || value.includes('plug-in') || value.includes('phev')) {
    return 'PHEV';
  }
  if (value.includes('hybrid')) return 'Hybrid';
  return 'Petrol';
}

function normalizeHealthStatus(raw: string | null | undefined): VehicleData['healthStatus'] {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('critical')) return 'Critical';
  if (value.includes('warning')) return 'Warning';
  return 'Good Health';
}

function normalizeCleaningStatus(
  raw: string | null | undefined,
): VehicleData['cleaningStatus'] {
  const value = (raw ?? '').toLowerCase();
  return value.includes('need') ? 'Needs Cleaning' : 'Clean';
}

function normalizeOnlineStatus(raw: unknown): VehicleOnlineStatus | undefined {
  if (raw === 'ONLINE' || raw === 'STANDBY' || raw === 'OFFLINE') return raw;
  return undefined;
}

function normalizeDisplayState(raw: unknown): VehicleDisplayState | undefined {
  if (raw === 'MOVING' || raw === 'IDLE' || raw === 'PARKED') return raw;
  return undefined;
}

function normalizeDisplayIgnition(raw: unknown): VehicleDisplayIgnition | undefined {
  if (raw === 'ON' || raw === 'OFF' || raw === 'UNKNOWN') return raw;
  return undefined;
}

function normalizeTelemetryFreshness(
  raw: unknown,
): VehicleData['telemetryFreshness'] {
  if (
    raw === 'live' ||
    raw === 'standby' ||
    raw === 'signal_delayed' ||
    raw === 'offline' ||
    raw === 'no_signal'
  ) {
    return raw;
  }
  return undefined;
}

function normalizeBookingReference(
  raw: Partial<VehicleBookingReference> | null | undefined,
): VehicleBookingReference | null {
  const bookingId = raw?.bookingId?.trim();
  if (!bookingId) return null;
  return {
    bookingId,
    customerName: raw?.customerName ?? null,
    pickupAt: raw?.pickupAt ?? null,
    returnAt: raw?.returnAt ?? null,
    pickupStationName: raw?.pickupStationName ?? null,
    returnStationName: raw?.returnStationName ?? null,
    isOverdue: Boolean(raw?.isOverdue),
  };
}

function mapLegacyBookingContext(raw: FleetMapVehicleResponse): VehicleBookingContext {
  const activeBooking = raw.activeBookingId
    ? normalizeBookingReference({
        bookingId: raw.activeBookingId,
        customerName: raw.activeCustomerName,
        pickupAt: raw.activeStartAt,
        returnAt: raw.activeReturnAt,
        pickupStationName: null,
        returnStationName: raw.activeReturnStationName,
        isOverdue: raw.activeIsOverdue,
      })
    : null;

  const reservedBooking = raw.reservedBookingId
    ? normalizeBookingReference({
        bookingId: raw.reservedBookingId,
        customerName: raw.reservedCustomerName,
        pickupAt: raw.reservedPickupAt,
        returnAt: raw.reservedReturnAt,
        pickupStationName: raw.reservedPickupStationName,
        returnStationName: null,
        isOverdue: raw.reservedIsOverdue,
      })
    : null;

  return {
    activeBooking,
    reservedBooking,
    nextBooking: null,
    futureBookingCount: 0,
  };
}

function resolveBookingContext(raw: FleetMapVehicleResponse): VehicleBookingContext {
  if (raw.bookingContext) {
    return {
      activeBooking: normalizeBookingReference(raw.bookingContext.activeBooking),
      reservedBooking: normalizeBookingReference(raw.bookingContext.reservedBooking),
      nextBooking: normalizeBookingReference(raw.bookingContext.nextBooking),
      futureBookingCount:
        typeof raw.bookingContext.futureBookingCount === 'number' &&
        Number.isFinite(raw.bookingContext.futureBookingCount)
          ? Math.max(0, Math.floor(raw.bookingContext.futureBookingCount))
          : 0,
    };
  }
  return mapLegacyBookingContext(raw);
}

function resolveOperationalState(
  raw: FleetMapVehicleResponse,
  rawVehicleStatus: string,
): VehicleOperationalState {
  const dto = raw.operationalState ?? null;
  const dataQualityState =
    dto?.dataQualityState ??
    (raw as { dataQualityState?: VehicleOperationalState['dataQualityState'] })
      .dataQualityState ??
    null;
  const isReliable =
    dto?.isReliable ??
    (raw as { isReliable?: boolean | null }).isReliable ??
    null;

  return normalizeVehicleOperationalStateDto(
    dto
      ? {
          ...dto,
          dataQualityState: dto.dataQualityState ?? dataQualityState,
          isReliable: dto.isReliable ?? isReliable ?? undefined,
        }
      : {
          dataQualityState,
          isReliable: isReliable ?? undefined,
        },
    rawVehicleStatus,
  );
}

/** Flat legacy booking fields derived from canonical booking context (read-only projection). */
export function flattenBookingContextToLegacy(
  bookingContext: VehicleBookingContext,
  raw: Pick<
    FleetMapVehicleResponse,
    'activeKmIncluded' | 'activeKmDriven'
  > = { activeKmIncluded: null, activeKmDriven: null },
) {
  const active = bookingContext.activeBooking;
  const reserved = bookingContext.reservedBooking;

  return {
    reservedBookingId: reserved?.bookingId ?? null,
    reservedCustomerName: reserved?.customerName ?? null,
    reservedPickupAt: reserved?.pickupAt ?? null,
    reservedReturnAt: reserved?.returnAt ?? null,
    reservedPickupStationName: reserved?.pickupStationName ?? null,
    reservedIsOverdue: reserved?.isOverdue ?? false,
    activeBookingId: active?.bookingId ?? null,
    activeCustomerName: active?.customerName ?? null,
    activeStartAt: active?.pickupAt ?? null,
    activeReturnAt: active?.returnAt ?? null,
    activeReturnStationName: active?.returnStationName ?? null,
    activeKmIncluded: raw.activeKmIncluded ?? null,
    activeKmDriven: raw.activeKmDriven ?? null,
    activeIsOverdue: active?.isOverdue ?? false,
  };
}

/**
 * Map a fleet-map API row to the canonical store shape.
 * Backend is source of truth — this only validates and normalizes.
 */
export function mapFleetMapVehicleResponse(
  raw: FleetMapVehicleResponse,
): FleetMapVehicleRow {
  const rawVehicleStatus = String(raw.rawVehicleStatus ?? raw.status ?? '');
  const operationalState = resolveOperationalState(raw, rawVehicleStatus);
  const bookingContext = resolveBookingContext(raw);
  const legacyBooking = flattenBookingContextToLegacy(bookingContext, raw);

  const fuelType = normalizeFuelType(raw.fuelType);
  const healthStatus = normalizeHealthStatus(raw.healthStatus);
  const cleaningStatus = normalizeCleaningStatus(raw.cleaningStatus);
  const isElectric =
    typeof raw.isElectric === 'boolean'
      ? raw.isElectric
      : fuelType === 'Electric' || fuelType === 'PHEV';

  const fuelPercent = toFiniteNumber(raw.fuelPercent) ?? null;
  const evSocPercent = toFiniteNumber(raw.evSoc) ?? null;
  const odometerKm = toFiniteNumber(raw.odometerKm) ?? null;
  const chargePct = isElectric
    ? evSocPercent ?? fuelPercent
    : fuelPercent ?? evSocPercent;

  const reasonCode = (
    raw.maintenanceReasonCode === 'SCHEDULED_SERVICE' ||
    raw.maintenanceReasonCode === 'OPERATIONAL_BLOCK'
      ? raw.maintenanceReasonCode
      : null
  ) as FleetMaintenanceReasonCode | null;

  const homeStationId = raw.homeStationId ?? raw.stationId ?? null;
  const currentStationId = raw.currentStationId ?? null;

  return {
    id: raw.id,
    license: raw.licensePlate ?? '',
    make: raw.make ?? '',
    model: raw.model || raw.make || raw.licensePlate || 'Unknown vehicle',
    year: raw.year ?? 0,
    station: raw.stationName ?? '',
    homeStationId,
    currentStationId,
    expectedStationId: raw.expectedStationId ?? null,
    fuelType,
    status: operationalState.status,
    rawVehicleStatus,
    operationalState,
    bookingContext,
    dataQualityState: operationalState.dataQualityState,
    dataQualityReasons: operationalState.dataQualityReasons,
    isReliable: operationalState.isReliable,
    cleaningStatus,
    healthStatus,
    online: raw.isFresh,
    lastSignal: raw.measuredAt ?? raw.lastSeenAt ?? '',
    measuredAt: raw.measuredAt ?? raw.lastSeenAt ?? null,
    receivedAt: raw.receivedAt ?? null,
    cachedAt: raw.cachedAt ?? null,
    badge: 0,
    odometer: odometerKm,
    fuel:
      chargePct != null
        ? Math.max(0, Math.min(100, Math.round(chargePct)))
        : null,
    fuelLevel: fuelPercent,
    battery: evSocPercent,
    speed: null,
    coolant: null,
    brakes: null,
    tires: null,
    engineOil: null,
    odometerKm,
    fuelPercent,
    evSoc: evSocPercent,
    isElectric,
    hvBatteryCapacityKwh: null,
    lat: toFiniteNumber(raw.latitude),
    lng: toFiniteNumber(raw.longitude),
    leasingRate: '€ 0,00',
    insuranceCost: '€ 0,00',
    taxCost: '€ 0,00',
    totalMonthlyCost: '€ 0,00',
    imageUrl: raw.imageUrl ?? null,
    signalAgeMs: toFiniteNumber(raw.signalAgeMs),
    isFresh: typeof raw.isFresh === 'boolean' ? raw.isFresh : undefined,
    onlineStatus: normalizeOnlineStatus(raw.onlineStatus),
    telemetryFreshness: normalizeTelemetryFreshness(raw.telemetryFreshness),
    displayState: normalizeDisplayState(raw.displayState),
    displayIgnition: normalizeDisplayIgnition(raw.displayIgnition),
    isLiveTracking:
      typeof raw.isLiveTracking === 'boolean' ? raw.isLiveTracking : undefined,
    stationId: homeStationId,
    stationName: raw.stationName ?? null,
    heading: toFiniteNumber(raw.heading) ?? null,
    lastSeenAt: raw.lastSeenAt ?? null,
    connectivityRuntime: raw.connectivityRuntime,
    ...legacyBooking,
    maintenanceReason: raw.maintenanceReason ?? null,
    maintenanceReasonCode: reasonCode,
    maintenanceUrgency:
      raw.maintenanceUrgency === 'planned' || raw.maintenanceUrgency === 'urgent'
        ? raw.maintenanceUrgency
        : null,
  };
}

export function normalizeFleetMapApiResponse(
  response: FleetMapVehicleResponse[] | { data?: FleetMapVehicleResponse[] } | unknown,
): FleetMapVehicleResponse[] {
  if (Array.isArray(response)) return response;
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: FleetMapVehicleResponse[] }).data;
  }
  return [];
}
