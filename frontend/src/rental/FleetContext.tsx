import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useRentalOrg } from './RentalContext';
import type { VehicleData, VehicleOnlineStatus, VehicleDisplayState, VehicleDisplayIgnition } from './data/vehicles';

const FLEET_REFRESH_MS = 30_000;

function mapApiToVehicleData(v: any): VehicleData {
  const fuelType = (v.fuelType || 'Other') as VehicleData['fuelType'];
  const status = (v.status || 'Available') as VehicleData['status'];
  const cleaningStatus = (v.cleaningStatus || 'Clean') as VehicleData['cleaningStatus'];
  const healthStatus = (v.healthStatus || 'Good Health') as VehicleData['healthStatus'];

  const onlineStatus = (['ONLINE', 'STANDBY', 'OFFLINE'].includes(v.onlineStatus) ? v.onlineStatus : undefined) as VehicleOnlineStatus | undefined;
  const displayState = (['MOVING', 'IDLE', 'PARKED'].includes(v.displayState) ? v.displayState : undefined) as VehicleDisplayState | undefined;
  const displayIgnition = (['ON', 'OFF', 'UNKNOWN'].includes(v.displayIgnition) ? v.displayIgnition : undefined) as VehicleDisplayIgnition | undefined;

  return {
    id: v.id,
    license: v.license ?? v.licensePlate ?? '',
    model: v.model ?? '',
    year: v.year ?? 0,
    station: v.station ?? '',
    fuelType: ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'PHEV'].includes(fuelType) ? fuelType : 'Petrol',
    status: ['Available', 'Active Rented', 'Reserved', 'Maintenance'].includes(status) ? status : 'Available',
    cleaningStatus: ['Clean', 'Needs Cleaning'].includes(cleaningStatus) ? cleaningStatus : 'Clean',
    healthStatus: ['Good Health', 'Warning', 'Critical'].includes(healthStatus) ? healthStatus : 'Good Health',
    online: v.online ?? false,
    lastSignal: v.lastSignal ?? '',
    badge: v.badge ?? 0,
    odometer: v.odometer ?? 0,
    fuel: v.fuel ?? 0,
    // `battery` in rental runtime is EV energy/SoC percent (not battery health).
    battery: v.battery ?? 0,
    speed: v.speed ?? 0,
    coolant: v.coolant ?? 0,
    brakes: v.brakes ?? 0,
    tires: v.tires ?? 0,
    engineOil: v.engineOil ?? 0,
    isElectric: v.isElectric ?? (v.fuelType === 'Electric' || v.fuelType === 'PHEV'),
    hvBatteryCapacityKwh: v.hvBatteryCapacityKwh ?? null,
    fuelLevel: v.fuelLevel ?? null,
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    make: v.make ?? '',
    alert: v.alert ?? null,
    driver: v.driver,
    ert: v.ert,
    customer: v.customer,
    pickup: v.pickup,
    reason: v.reason,
    workshop: v.workshop,
    eta: v.eta,
    leasingRate: v.leasingRate ?? '€ 0,00',
    insuranceCost: v.insuranceCost ?? '€ 0,00',
    taxCost: v.taxCost ?? '€ 0,00',
    totalMonthlyCost: v.totalMonthlyCost ?? '€ 0,00',
    imageUrl: v.imageUrl ?? null,
    signalAgeMs: typeof v.signalAgeMs === 'number' ? v.signalAgeMs : undefined,
    isFresh: typeof v.isFresh === 'boolean' ? v.isFresh : undefined,
    onlineStatus,
    displayState,
    displayIgnition,
    isLiveTracking: typeof v.isLiveTracking === 'boolean' ? v.isLiveTracking : undefined,
  };
}

interface FleetContextValue {
  fleetVehicles: VehicleData[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Seconds until next automatic refresh (0–30). */
  countdown: number;
}

const FleetCtx = createContext<FleetContextValue>({
  fleetVehicles: [],
  loading: true,
  refresh: async () => {},
  countdown: 30,
});

export function FleetProvider({ children }: { children: ReactNode }) {
  const { orgId } = useRentalOrg();
  const [fleetVehicles, setFleetVehicles] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const lastRefreshRef = useRef(Date.now());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    <FleetCtx.Provider value={{ fleetVehicles, loading, refresh, countdown }}>
      {children}
    </FleetCtx.Provider>
  );
}

export function useFleetVehicles() {
  return useContext(FleetCtx);
}
