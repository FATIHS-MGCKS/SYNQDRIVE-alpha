import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import { mapOverallHealthBoxState } from '../components/vehicle-detail/vehicle-health-box.mapper';
import { buildFleetVehicleContexts, resolveFleetCommandRowSeverity } from './fleet-operator-panel';
import type { VehicleData } from '../data/vehicles';

function rentalHealthBlocked(): VehicleHealthResponse {
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: 'critical',
    rental_blocked: true,
    blocking_reasons: ['battery_readiness_not_ready'],
    generated_at: new Date().toISOString(),
    modules: {
      battery: {
        state: 'critical',
        reason: '12V-Batterie: Vermietung blockiert — Werkstattbefund',
        last_updated_at: null,
        data_stale: false,
      },
      tires: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      brakes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      error_codes: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
      service_compliance: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      complaints: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
      vehicle_alerts: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
    },
  };
}

function vehicle(): VehicleData {
  return {
    id: 'v-battery-ready',
    license: 'BAT-1',
    make: 'VW',
    model: 'ID.4',
    status: 'Available',
    healthStatus: 'Good Health',
  } as VehicleData;
}

describe('battery readiness display', () => {
  it('maps rental_blocked battery module to critical health box', () => {
    const box = mapOverallHealthBoxState({
      rentalHealth: rentalHealthBlocked(),
      rentalHealthLoading: false,
      healthError: null,
    });
    expect(box.state).toBe('critical');
  });

  it('fleet command row treats rental_blocked as critical severity', () => {
    const [ctx] = buildFleetVehicleContexts([vehicle()], () => rentalHealthBlocked());
    expect(resolveFleetCommandRowSeverity(ctx)).toBe('critical');
  });
});
