import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../../lib/api';
import {
  mapDataCoverageDisplay,
  mapHealthSeverityDisplay,
} from './vehicle-health-display.mapper';

function mod(
  state: VehicleHealthResponse['overall_state'],
  reason = '',
  last_updated_at: string | null = null,
  data_stale = false,
) {
  return { state, reason, last_updated_at, data_stale };
}

function rentalHealth(
  overall: VehicleHealthResponse['overall_state'],
  modules?: Partial<VehicleHealthResponse['modules']>,
): VehicleHealthResponse {
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
      ...modules,
    },
  };
}

describe('vehicle-health-display.mapper', () => {
  describe('mapHealthSeverityDisplay', () => {
    it('battery good + tires good + brakes untracked → Good severity, not Limited Data', () => {
      const health = rentalHealth('unknown', {
        battery: mod('good'),
        tires: mod('good'),
        brakes: mod('unknown', 'No tracking'),
      });
      const r = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
        trackedCount: 2,
      });
      expect(r.severity).toBe('good');
      expect(r.label).toBe('Good');
      expect(r.label).not.toBe('Limited Data');
    });

    it('no active issues + 1 untracked module → Good severity', () => {
      const health = rentalHealth('unknown', {
        brakes: mod('unknown', 'No tracking'),
      });
      const r = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
        trackedCount: 2,
      });
      expect(r.severity).toBe('good');
    });

    it('critical issue → Critical severity', () => {
      const health = rentalHealth('critical', {
        battery: mod('critical', 'Low voltage'),
      });
      const r = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.severity).toBe('critical');
      expect(r.label).toBe('Critical');
    });

    it('warning issue → Warning severity', () => {
      const health = rentalHealth('warning', {
        tires: mod('warning', 'Wear soon'),
      });
      const r = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
      });
      expect(r.severity).toBe('warning');
      expect(r.label).toBe('Warning');
    });

    it('no core modules tracked → No Data', () => {
      const health = rentalHealth('unknown', {
        battery: mod('unknown', 'No tracking'),
        tires: mod('unknown', 'No tracking'),
        brakes: mod('unknown', 'No tracking'),
      });
      const r = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
        trackedCount: 0,
      });
      expect(r.severity).toBe('no_data');
      expect(r.label).toBe('No Data');
    });
  });

  describe('mapDataCoverageDisplay', () => {
    it('2 of 3 tracked → Limited Data coverage', () => {
      const health = rentalHealth('unknown', {
        brakes: mod('unknown', 'No tracking'),
      });
      const coverage = mapDataCoverageDisplay({
        rentalHealth: health,
        trackedCount: 2,
        untrackedCount: 1,
      });
      expect(coverage?.label).toBe('Limited Data');
      expect(coverage?.coverage).toBe('limited');
    });

    it('all tracked → no coverage badge', () => {
      const coverage = mapDataCoverageDisplay({
        rentalHealth: rentalHealth('good'),
        trackedCount: 3,
        untrackedCount: 0,
      });
      expect(coverage).toBeNull();
    });

    it('critical + limited tracking → coverage still Limited Data', () => {
      const health = rentalHealth('critical', {
        brakes: mod('unknown', 'No tracking'),
      });
      const severity = mapHealthSeverityDisplay({
        rentalHealth: health,
        rentalHealthLoading: false,
        healthError: null,
        trackedCount: 2,
      });
      const coverage = mapDataCoverageDisplay({
        rentalHealth: health,
        trackedCount: 2,
        untrackedCount: 1,
      });
      expect(severity.severity).toBe('critical');
      expect(coverage?.label).toBe('Limited Data');
    });
  });
});
