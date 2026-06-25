import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../../lib/api';
import {
  mapFaultsStat,
  mapOverallHealthBoxState,
  resolveServiceComplianceTone,
} from './vehicle-health-box.mapper';

function rentalHealth(overall: VehicleHealthResponse['overall_state']): VehicleHealthResponse {
  const mod = (state: VehicleHealthResponse['overall_state'], reason = '') => ({
    state,
    reason,
    last_updated_at: null,
    data_stale: false,
  });
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: overall,
    rental_blocked: false,
    blocking_reasons: [],
    generated_at: new Date().toISOString(),
    modules: {
      battery: mod('good'),
      tires: mod('good'),
      brakes: mod('good'),
      error_codes: mod('unknown'),
      service_compliance: mod('good'),
      complaints: mod('unknown'),
      vehicle_alerts: mod('unknown'),
    },
  };
}

describe('vehicle-health-box.mapper', () => {
  describe('mapOverallHealthBoxState', () => {
    it('critical → Critical', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: rentalHealth('critical'),
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.state).toBe('critical');
      expect(r.label).toBe('Critical');
    });

    it('warning → Warning', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: rentalHealth('warning'),
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.state).toBe('warning');
    });

    it('good → Good Health', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: rentalHealth('good'),
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.state).toBe('good');
      expect(r.label).toBe('Good Health');
    });

    it('unknown → Limited Data (never good)', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: rentalHealth('unknown'),
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.state).toBe('insufficient');
      expect(r.label).toBe('Limited Data');
    });

    it('endpoint error without health → unavailable', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: null,
        rentalHealthLoading: false,
        healthError: 'Failed to load',
      });
      expect(r.state).toBe('unavailable');
    });

    it('loading without health → loading', () => {
      const r = mapOverallHealthBoxState({
        rentalHealth: null,
        rentalHealthLoading: true,
        healthError: null,
      });
      expect(r.state).toBe('loading');
    });
  });

  describe('mapFaultsStat', () => {
    it('endpoint error → — / DTC unavailable', () => {
      const r = mapFaultsStat(rentalHealth('good'), 'error', null);
      expect(r.displayValue).toBe('—');
      expect(r.sublabel).toBe('DTC unavailable');
    });

    it('loaded 0 codes → 0', () => {
      const health = rentalHealth('good');
      health.modules.error_codes = {
        state: 'good',
        reason: '',
        last_updated_at: '2026-01-01T00:00:00.000Z',
        data_stale: false,
      };
      const r = mapFaultsStat(health, 'loaded', 0);
      expect(r.displayValue).toBe('0');
      expect(r.sublabel).toBeUndefined();
    });

    it('stale module → — / Datenstand verzögert', () => {
      const health = rentalHealth('good');
      health.modules.error_codes = {
        state: 'warning',
        reason: 'stale',
        last_updated_at: '2020-01-01',
        data_stale: true,
      };
      const r = mapFaultsStat(health, 'loaded', 2);
      expect(r.displayValue).toBe('—');
      expect(r.sublabel).toBe('Datenstand verzögert');
    });

    it('never shows 0 on load error', () => {
      const r = mapFaultsStat(rentalHealth('good'), 'error', 0);
      expect(r.displayValue).toBe('—');
    });
  });

  describe('resolveServiceComplianceTone', () => {
    it('rental warning overrides display good', () => {
      expect(
        resolveServiceComplianceTone('good', {
          state: 'warning',
          reason: 'TÜV due',
          last_updated_at: null,
          data_stale: false,
        }),
      ).toBe('warning');
    });

    it('rental unknown prevents display good', () => {
      expect(
        resolveServiceComplianceTone('good', {
          state: 'unknown',
          reason: '',
          last_updated_at: null,
          data_stale: false,
        }),
      ).toBe('neutral');
    });
  });
});
