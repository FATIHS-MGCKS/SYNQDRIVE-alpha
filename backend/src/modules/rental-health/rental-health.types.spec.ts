import {
  buildDegradedVehicleHealth,
  buildModuleAvailabilityInputs,
  computeOverallState,
  computeRentalHealthAvailability,
  finalizeVehicleHealthAvailability,
  resolveModulePipelineAvailability,
  resolveRentalBlockedState,
  RENTAL_HEALTH_DEGRADATION_CODES,
  type HealthState,
  type ModuleHealth,
  type RentalHealthModuleKey,
} from './rental-health.types';
import {
  dtcBandToHealthState,
  isSafetyCriticalDtcBand,
  maxDtcSeverityBand,
  normalizeDtcSeverityBand,
} from '../vehicle-intelligence/dtc/dtc-severity.util';

describe('computeOverallState', () => {
  const mod = (state: HealthState): Pick<ModuleHealth, 'state'> => ({ state });

  it('unknown is never promoted to good', () => {
    expect(computeOverallState([mod('good'), mod('unknown')])).toBe('unknown');
  });

  it('all good => good', () => {
    expect(computeOverallState([mod('good'), mod('good')])).toBe('good');
  });

  it('n_a modules are excluded from aggregate', () => {
    expect(computeOverallState([mod('good'), mod('n_a')])).toBe('good');
    expect(computeOverallState([mod('n_a')])).toBe('unknown');
  });
});

describe('resolveModulePipelineAvailability', () => {
  it('maps pipeline failures to unavailable — not confused with unknown state', () => {
    expect(resolveModulePipelineAvailability('unknown', { loadFailed: true })).toBe(
      'unavailable',
    );
    expect(resolveModulePipelineAvailability('unknown')).toBe('available');
  });

  it('treats n_a as not_applicable regardless of load failure', () => {
    expect(resolveModulePipelineAvailability('n_a', { loadFailed: true })).toBe(
      'not_applicable',
    );
    expect(resolveModulePipelineAvailability('n_a')).toBe('not_applicable');
  });
});

describe('computeRentalHealthAvailability', () => {
  const input = (
    key: RentalHealthModuleKey,
    state: HealthState,
    pipeline: 'available' | 'unavailable' | 'not_applicable',
  ) => ({ key, state, pipeline_availability: pipeline });

  it('ready when every applicable module pipeline is available', () => {
    expect(
      computeRentalHealthAvailability([
        input('battery', 'good', 'available'),
        input('tires', 'unknown', 'available'),
        input('vehicle_alerts', 'n_a', 'not_applicable'),
      ]),
    ).toBe('ready');
  });

  it('ready allows unknown severity when pipeline responded', () => {
    expect(
      computeRentalHealthAvailability([
        input('battery', 'unknown', 'available'),
        input('error_codes', 'good', 'available'),
      ]),
    ).toBe('ready');
  });

  it('partial when some applicable modules failed pipeline', () => {
    expect(
      computeRentalHealthAvailability([
        input('battery', 'good', 'available'),
        input('brakes', 'unknown', 'unavailable'),
        input('tires', 'warning', 'available'),
      ]),
    ).toBe('partial');
  });

  it('unavailable when no applicable module pipeline succeeded', () => {
    expect(
      computeRentalHealthAvailability([
        input('battery', 'unknown', 'unavailable'),
        input('brakes', 'unknown', 'unavailable'),
      ]),
    ).toBe('unavailable');
  });

  it('unavailable when every module is not_applicable', () => {
    expect(
      computeRentalHealthAvailability([
        input('vehicle_alerts', 'n_a', 'not_applicable'),
      ]),
    ).toBe('unavailable');
  });
});

describe('buildModuleAvailabilityInputs', () => {
  const allGoodModules = () =>
    ({
      battery: { state: 'good' },
      tires: { state: 'good' },
      brakes: { state: 'good' },
      error_codes: { state: 'good' },
      service_compliance: { state: 'good' },
      complaints: { state: 'good' },
      vehicle_alerts: { state: 'n_a' },
    }) as Record<RentalHealthModuleKey, Pick<ModuleHealth, 'state'>>;

  it('derives ready from load-failure map', () => {
    const inputs = buildModuleAvailabilityInputs(allGoodModules());
    expect(computeRentalHealthAvailability(inputs)).toBe('ready');
  });

  it('flags only failed pipelines as unavailable', () => {
    const inputs = buildModuleAvailabilityInputs(allGoodModules(), {
      brakes: true,
      tires: true,
    });
    expect(computeRentalHealthAvailability(inputs)).toBe('partial');
    expect(inputs.find((m) => m.key === 'brakes')?.pipeline_availability).toBe(
      'unavailable',
    );
    expect(inputs.find((m) => m.key === 'battery')?.pipeline_availability).toBe(
      'available',
    );
  });
});

describe('finalizeVehicleHealthAvailability', () => {
  const baseModule = (state: HealthState): ModuleHealth => ({
    state,
    reason: 'test',
    last_updated_at: null,
    data_stale: false,
  });

  const fullModules = (overrides: Partial<Record<RentalHealthModuleKey, HealthState>> = {}) =>
    ({
      battery: baseModule(overrides.battery ?? 'good'),
      tires: baseModule(overrides.tires ?? 'good'),
      brakes: baseModule(overrides.brakes ?? 'good'),
      error_codes: baseModule(overrides.error_codes ?? 'good'),
      service_compliance: baseModule(overrides.service_compliance ?? 'good'),
      complaints: baseModule(overrides.complaints ?? 'good'),
      vehicle_alerts: baseModule(overrides.vehicle_alerts ?? 'n_a'),
    }) as Record<RentalHealthModuleKey, ModuleHealth>;

  it('preserves existing module payloads in partial mode', () => {
    const modules = fullModules({ brakes: 'warning', tires: 'critical' });
    const { modules: finalized, availability } = finalizeVehicleHealthAvailability(modules, {
      brakes: true,
    });

    expect(availability).toBe('partial');
    expect(finalized.tires.state).toBe('critical');
    expect(finalized.brakes.state).toBe('warning');
    expect(finalized.brakes.pipeline_available).toBe(false);
    expect(finalized.tires.pipeline_available).toBe(true);
  });

  it('keeps overall_state independent from availability semantics', () => {
    const modules = fullModules({ battery: 'unknown', tires: 'good' });
    const { availability } = finalizeVehicleHealthAvailability(modules);
    expect(computeOverallState(Object.values(modules))).toBe('unknown');
    expect(availability).toBe('ready');
  });
});

describe('resolveRentalBlockedState', () => {
  it('returns null for partial pipeline coverage', () => {
    expect(resolveRentalBlockedState('partial', [])).toBeNull();
    expect(resolveRentalBlockedState('partial', ['TÜV abgelaufen'])).toBeNull();
  });

  it('returns null for unavailable pipeline coverage', () => {
    expect(resolveRentalBlockedState('unavailable', [])).toBeNull();
  });

  it('returns boolean only when availability is ready', () => {
    expect(resolveRentalBlockedState('ready', [])).toBe(false);
    expect(resolveRentalBlockedState('ready', ['Brakes critical'])).toBe(true);
  });
});

describe('buildDegradedVehicleHealth', () => {
  it('never emits confirmed rental_blocked false on pipeline failure', () => {
    const degraded = buildDegradedVehicleHealth({
      vehicle_id: 'veh-1',
      organization_id: 'org-1',
      degradation: {
        code: RENTAL_HEALTH_DEGRADATION_CODES.PIPELINE_UNAVAILABLE,
        message: 'Gesundheitsdaten konnten nicht geladen werden',
      },
    });

    expect(degraded.overall_state).toBe('unknown');
    expect(degraded.availability).toBe('unavailable');
    expect(degraded.rental_blocked).toBeNull();
    expect(degraded.blocking_reasons).toEqual([]);
    expect(degraded.degradation?.code).toBe(
      RENTAL_HEALTH_DEGRADATION_CODES.PIPELINE_UNAVAILABLE,
    );
    expect(degraded.degradation?.message).not.toMatch(/Error|stack|prisma/i);
  });
});

describe('normalizeDtcSeverityBand', () => {
  it.each([
    ['critical', 'critical'],
    ['CRITICAL', 'critical'],
    ['high', 'critical'],
    ['severe', 'critical'],
    ['safety_critical', 'critical'],
    ['warning', 'warning'],
    ['medium', 'warning'],
    ['moderate', 'warning'],
    ['info', 'info'],
    ['low', 'info'],
    ['minor', 'info'],
    ['', 'unknown'],
    [null, 'unknown'],
  ])('%s => %s', (input, expected) => {
    expect(normalizeDtcSeverityBand(input)).toBe(expected);
  });

  it('critical DTC with critical severity band blocks safety', () => {
    const band = normalizeDtcSeverityBand('critical');
    expect(isSafetyCriticalDtcBand(band)).toBe(true);
    expect(dtcBandToHealthState(band)).toBe('critical');
  });

  it('max severity across mixed faults', () => {
    expect(
      maxDtcSeverityBand([
        normalizeDtcSeverityBand('info'),
        normalizeDtcSeverityBand('critical'),
        normalizeDtcSeverityBand('medium'),
      ]),
    ).toBe('critical');
  });
});
