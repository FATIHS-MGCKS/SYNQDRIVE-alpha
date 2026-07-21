import type { VehicleHealthResponse, RentalHealthModule, RentalHealthState } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';

const SCALE_TIERS = [100, 500, 1000, 5000] as const;
export type FleetHealthScaleTier = (typeof SCALE_TIERS)[number];
export const FLEET_HEALTH_SCALE_TIERS: readonly FleetHealthScaleTier[] = SCALE_TIERS;

function mod(state: RentalHealthState, reason: string): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: '2026-07-01T00:00:00.000Z',
    data_stale: false,
  };
}

function baseModules(
  state: RentalHealthState = 'good',
): VehicleHealthResponse['modules'] {
  const m = mod(state, `Module ${state}`);
  return {
    battery: m,
    tires: m,
    brakes: m,
    error_codes: m,
    service_compliance: m,
    complaints: m,
    vehicle_alerts: m,
  };
}

export function syntheticVehicleHealth(
  index: number,
  profile: 'good' | 'warning' | 'critical' | 'blocked' = 'good',
): VehicleHealthResponse {
  const id = `veh-${String(index).padStart(5, '0')}`;
  const profiles: Record<typeof profile, Partial<VehicleHealthResponse>> = {
    good: { overall_state: 'good', rental_blocked: false, blocking_reasons: [] },
    warning: { overall_state: 'warning', rental_blocked: false, blocking_reasons: ['Service fällig'] },
    critical: {
      overall_state: 'critical',
      rental_blocked: false,
      blocking_reasons: ['Reifen kritisch'],
      modules: { ...baseModules('critical'), tires: mod('critical', 'Wear critical') },
    },
    blocked: {
      overall_state: 'critical',
      rental_blocked: true,
      blocking_reasons: ['TÜV überfällig'],
      modules: {
        ...baseModules('critical'),
        service_compliance: mod('critical', 'TÜV überfällig'),
      },
    },
  };

  const patch = profiles[profile];
  return {
    vehicle_id: id,
    organization_id: 'org-scale',
    overall_state: patch.overall_state ?? 'good',
    availability: 'ready',
    rental_blocked: patch.rental_blocked ?? false,
    blocking_reasons: patch.blocking_reasons ?? [],
    modules: patch.modules ?? baseModules(patch.overall_state ?? 'good'),
    generated_at: '2026-07-01T00:00:00.000Z',
  };
}

export function syntheticVehicleData(index: number): VehicleData {
  const id = `veh-${String(index).padStart(5, '0')}`;
  return {
    id,
    license: `M-SD ${index}`,
    model: 'Golf',
    make: 'VW',
    year: 2022,
    station: index % 3 === 0 ? 'Nord' : index % 3 === 1 ? 'Süd' : 'Zentrale',
    fuelType: 'Petrol',
    status: 'AVAILABLE',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: 'now',
    badge: 0,
    odometer: 10_000 + index,
    fuel: 80,
    battery: 80,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    alert: null,
    leasingRate: '0',
    insuranceCost: '0',
    taxCost: '0',
    totalMonthlyCost: '0',
  };
}

/** Mixed fleet: ~5% blocked, ~10% critical, ~15% warning, rest good. */
export function buildSyntheticFleetHealthMap(
  count: FleetHealthScaleTier,
): Map<string, VehicleHealthResponse> {
  const map = new Map<string, VehicleHealthResponse>();
  for (let i = 0; i < count; i++) {
    let profile: 'good' | 'warning' | 'critical' | 'blocked' = 'good';
    const bucket = i % 20;
    if (bucket === 0) profile = 'blocked';
    else if (bucket <= 2) profile = 'critical';
    else if (bucket <= 5) profile = 'warning';
    const health = syntheticVehicleHealth(i, profile);
    map.set(health.vehicle_id, health);
  }
  return map;
}

export function buildSyntheticFleetVehicles(count: FleetHealthScaleTier): VehicleData[] {
  return Array.from({ length: count }, (_, i) => syntheticVehicleData(i));
}

export function buildSyntheticHealthMapFromVehicles(
  vehicles: VehicleData[],
  profile: 'good' | 'warning' | 'critical' | 'blocked' = 'good',
): Map<string, VehicleHealthResponse> {
  const map = new Map<string, VehicleHealthResponse>();
  vehicles.forEach((vehicle, index) => {
    map.set(vehicle.id, syntheticVehicleHealth(index, profile));
  });
  return map;
}
