import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { VehicleHealthResponse, RentalHealthState } from '../lib/api';
import { useRentalOrg } from './RentalContext';
import { useFleetHealthMap } from './hooks/useVehicleHealth';
import type { VehicleData, VehicleOnlineStatus, VehicleDisplayState, VehicleDisplayIgnition, FleetMaintenanceReasonCode } from './data/vehicles';

export type EffectiveHealthStatus = 'Critical' | 'Warning' | 'Good Health' | 'Unknown';

export function statusFromRentalHealth(state: RentalHealthState | undefined): EffectiveHealthStatus {
  if (state === 'critical') return 'Critical';
  if (state === 'warning') return 'Warning';
  if (state === 'good') return 'Good Health';
  return 'Unknown';
}

const FLEET_REFRESH_MS = 30_000;

function mapApiToVehicleData(v: any): VehicleData {
  const fuelType = (v.fuelType || 'Other') as VehicleData['fuelType'];
  const status = (v.status || 'Available') as VehicleData['status'];
  const cleaningStatus = (v.cleaningStatus || 'Clean') as VehicleData['cleaningStatus'];
  const healthStatus = (v.healthStatus || 'Good Health') as VehicleData['healthStatus'];

  const onlineStatus = (['ONLINE', 'STANDBY', 'OFFLINE'].includes(v.onlineStatus) ? v.onlineStatus : undefined) as VehicleOnlineStatus | undefined;
  const telemetryFreshness = (['live', 'standby', 'signal_delayed', 'offline', 'no_signal'].includes(
    v.telemetryFreshness,
  )
    ? v.telemetryFreshness
    : undefined) as VehicleData['telemetryFreshness'];
  const displayState = (['MOVING', 'IDLE', 'PARKED'].includes(v.displayState) ? v.displayState : undefined) as VehicleDisplayState | undefined;
  const displayIgnition = (['ON', 'OFF', 'UNKNOWN'].includes(v.displayIgnition) ? v.displayIgnition : undefined) as VehicleDisplayIgnition | undefined;

  // V4.6.85 — preserve null telemetry so UI cells can render "—" instead
  // of a misleading "0 km" / "0%".
  const odometerKm =
    typeof v.odometerKm === 'number' && Number.isFinite(v.odometerKm)
      ? v.odometerKm
      : typeof v.odometer === 'number' && Number.isFinite(v.odometer) && v.odometer > 0
        ? v.odometer
        : null;
  const fuelPercent =
    typeof v.fuelPercent === 'number' && Number.isFinite(v.fuelPercent)
      ? v.fuelPercent
      : null;
  const evSoc =
    typeof v.evSoc === 'number' && Number.isFinite(v.evSoc)
      ? v.evSoc
      : typeof v.battery === 'number' && Number.isFinite(v.battery) && v.battery > 0
        ? v.battery
        : null;
  const reasonCode = (['SCHEDULED_SERVICE', 'OPERATIONAL_BLOCK'].includes(
    v.maintenanceReasonCode,
  )
    ? v.maintenanceReasonCode
    : null) as FleetMaintenanceReasonCode | null;

  return {
    id: v.id,
    license: v.license ?? v.licensePlate ?? '',
    model: v.model ?? '',
    year: v.year ?? 0,
    station: v.station ?? v.stationName ?? '',
    stationId: v.homeStationId ?? v.stationId ?? null,
    homeStationId: v.homeStationId ?? v.stationId ?? null,
    currentStationId: v.currentStationId ?? null,
    expectedStationId: v.expectedStationId ?? null,
    fuelType: ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'PHEV'].includes(fuelType) ? fuelType : 'Petrol',
    status: ['Available', 'Active Rented', 'Reserved', 'Maintenance'].includes(status) ? status : 'Available',
    cleaningStatus: ['Clean', 'Needs Cleaning'].includes(cleaningStatus) ? cleaningStatus : 'Clean',
    healthStatus: ['Good Health', 'Warning', 'Critical'].includes(healthStatus) ? healthStatus : 'Good Health',
    online: v.online ?? false,
    lastSignal: v.lastSignal ?? '',
    badge: v.badge ?? 0,
    // Legacy numeric mirrors — kept for aggregations / exports that read
    // `.odometer` / `.fuel` as plain numbers.
    odometer: odometerKm ?? 0,
    fuel: fuelPercent ?? evSoc ?? 0,
    // `battery` in rental runtime is EV energy/SoC percent (not battery health).
    battery: evSoc ?? 0,
    speed: v.speed ?? 0,
    coolant: v.coolant ?? 0,
    brakes: v.brakes ?? 0,
    tires: v.tires ?? 0,
    engineOil: v.engineOil ?? 0,
    isElectric: v.isElectric ?? (v.fuelType === 'Electric' || v.fuelType === 'PHEV'),
    hvBatteryCapacityKwh: v.hvBatteryCapacityKwh ?? null,
    fuelLevel: typeof v.fuelLevel === 'number' ? v.fuelLevel : fuelPercent,
    odometerKm,
    fuelPercent,
    evSoc,
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    make: v.make ?? '',
    alert: v.alert ?? null,
    leasingRate: v.leasingRate ?? '€ 0,00',
    insuranceCost: v.insuranceCost ?? '€ 0,00',
    taxCost: v.taxCost ?? '€ 0,00',
    totalMonthlyCost: v.totalMonthlyCost ?? '€ 0,00',
    imageUrl: v.imageUrl ?? null,
    signalAgeMs: typeof v.signalAgeMs === 'number' ? v.signalAgeMs : undefined,
    isFresh: typeof v.isFresh === 'boolean' ? v.isFresh : undefined,
    onlineStatus,
    telemetryFreshness,
    displayState,
    displayIgnition,
    isLiveTracking: typeof v.isLiveTracking === 'boolean' ? v.isLiveTracking : undefined,
    // V4.6.84/85 — fleet-status context propagated from backend
    reservedBookingId: v.reservedBookingId ?? null,
    reservedCustomerName: v.reservedCustomerName ?? null,
    reservedPickupAt: v.reservedPickupAt ?? null,
    reservedReturnAt: v.reservedReturnAt ?? null,
    reservedPickupStationName: v.reservedPickupStationName ?? null,
    reservedIsOverdue: Boolean(v.reservedIsOverdue),
    activeBookingId: v.activeBookingId ?? null,
    activeCustomerName: v.activeCustomerName ?? null,
    activeStartAt: v.activeStartAt ?? null,
    activeReturnAt: v.activeReturnAt ?? null,
    activeReturnStationName: v.activeReturnStationName ?? null,
    activeKmIncluded: typeof v.activeKmIncluded === 'number' ? v.activeKmIncluded : null,
    activeKmDriven: typeof v.activeKmDriven === 'number' ? v.activeKmDriven : null,
    activeIsOverdue: Boolean(v.activeIsOverdue),
    maintenanceReason: v.maintenanceReason ?? null,
    maintenanceReasonCode: reasonCode,
    maintenanceUrgency:
      v.maintenanceUrgency === 'planned' || v.maintenanceUrgency === 'urgent'
        ? v.maintenanceUrgency
        : null,
  };
}

interface FleetContextValue {
  fleetVehicles: VehicleData[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Seconds until next automatic refresh (0–30). */
  countdown: number;
  /**
   * V4.7.23 — Canonical Rental-Health-V1 map keyed by vehicleId.
   *
   * This is the single source of truth for per-vehicle health across every
   * Rental surface (FleetView, FleetCondition, Dashboard popups, Vehicle
   * Detail header). Loaded once via the batched `useFleetHealthMap` hook
   * and shared through the FleetProvider, so we never end up with two
   * surfaces showing different colours for the same vehicle.
   */
  healthMap: Map<string, VehicleHealthResponse>;
  healthLoading: boolean;
  healthError: string | null;
  reloadHealth: () => void;
}

const FleetCtx = createContext<FleetContextValue>({
  fleetVehicles: [],
  loading: true,
  refresh: async () => {},
  countdown: 30,
  healthMap: new Map(),
  healthLoading: false,
  healthError: null,
  reloadHealth: () => {},
});

export function FleetProvider({ children }: { children: ReactNode }) {
  const { orgId } = useRentalOrg();
  const [fleetVehicles, setFleetVehicles] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const lastRefreshRef = useRef(Date.now());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fleetVehicleIds = useMemo(() => fleetVehicles.map(v => v.id), [fleetVehicles]);
  const { map: healthMap, loading: healthLoading, error: healthError, reload: reloadHealth } =
    useFleetHealthMap(orgId, fleetVehicleIds);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setFleetVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.vehicles.listByOrg(orgId);
      const data = (res as { data?: any[] }).data ?? (Array.isArray(res) ? res : []);
      setFleetVehicles(data.map(mapApiToVehicleData));
    } catch {
      /* keep existing data on transient failure */
    } finally {
      setLoading(false);
      lastRefreshRef.current = Date.now();
      setCountdown(30);
    }
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refreshIntervalRef.current = setInterval(tick, FLEET_REFRESH_MS);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [orgId, refresh]);

  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastRefreshRef.current;
      const remaining = Math.max(0, Math.ceil((FLEET_REFRESH_MS - elapsed) / 1000));
      setCountdown(remaining);
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  return (
    <FleetCtx.Provider value={{ fleetVehicles, loading, refresh, countdown, healthMap, healthLoading, healthError, reloadHealth }}>
      {children}
    </FleetCtx.Provider>
  );
}

export function useFleetVehicles() {
  return useContext(FleetCtx);
}

/**
 * Canonical per-vehicle health hook — reads the shared FleetProvider map.
 * Use this everywhere a UI surface needs the rental-health status; do not
 * fall back to the stale `vehicle.healthStatus` column.
 */
export function useEffectiveHealth(vehicleId: string | null | undefined): {
  status: EffectiveHealthStatus;
  health: VehicleHealthResponse | null;
  loading: boolean;
} {
  const { healthMap, healthLoading } = useContext(FleetCtx);
  if (!vehicleId) return { status: 'Unknown', health: null, loading: healthLoading };
  const health = healthMap.get(vehicleId) ?? null;
  return {
    status: statusFromRentalHealth(health?.overall_state),
    health,
    loading: healthLoading,
  };
}
