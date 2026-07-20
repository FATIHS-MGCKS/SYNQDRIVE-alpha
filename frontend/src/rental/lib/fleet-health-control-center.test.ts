import { describe, expect, it } from 'vitest';
import type {
  RentalHealthModule,
  RentalHealthState,
  VehicleHealthResponse,
} from '../../lib/api';
import {
  buildFleetHealthDisplay,
  computeFleetHealthKpis,
  healthSeverityBand,
  matchesStatusFilter,
  operatorGroupForVehicle,
  priorityRank,
  rentalGateLabel,
} from './fleet-health-control-center';

type ModuleKey = keyof VehicleHealthResponse['modules'];

function mod(
  state: RentalHealthState,
  reason: string,
  extra: Partial<RentalHealthModule> = {},
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: extra.last_updated_at ?? '2026-06-22T00:00:00.000Z',
    data_stale: extra.data_stale ?? false,
    source: extra.source,
    evidence_type: extra.evidence_type,
  };
}

function buildHealth(
  overrides: Partial<{
    overall_state: RentalHealthState;
    rental_blocked: boolean | null;
    availability: VehicleHealthResponse['availability'];
    blocking_reasons: string[];
    modules: Partial<Record<ModuleKey, RentalHealthModule>>;
  }> = {},
): VehicleHealthResponse {
  const baseModules: Record<ModuleKey, RentalHealthModule> = {
    battery: mod('good', 'Batterie OK'),
    tires: mod('good', 'Reifen OK'),
    brakes: mod('good', 'Bremsen OK'),
    error_codes: mod('good', 'Keine aktiven Fehler'),
    service_compliance: mod('good', 'Service aktuell'),
    complaints: mod('good', 'Keine Beschwerden'),
    vehicle_alerts: mod('good', 'Keine Hinweise'),
  };
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: overrides.overall_state ?? 'good',
    availability: overrides.availability ?? 'ready',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules: { ...baseModules, ...(overrides.modules ?? {}) },
    generated_at: '2026-06-22T00:00:00.000Z',
  };
}

describe('healthSeverityBand', () => {
  it('treats rental_blocked as blocked regardless of overall_state', () => {
    expect(healthSeverityBand(buildHealth({ rental_blocked: true, overall_state: 'good' }))).toBe(
      'blocked',
    );
  });

  it('maps overall_state to bands', () => {
    expect(healthSeverityBand(buildHealth({ overall_state: 'critical' }))).toBe('critical');
    expect(healthSeverityBand(buildHealth({ overall_state: 'warning' }))).toBe('review');
    expect(healthSeverityBand(buildHealth({ overall_state: 'good' }))).toBe('good');
    expect(healthSeverityBand(buildHealth({ overall_state: 'unknown' }))).toBe('limited');
    expect(healthSeverityBand(null)).toBe('unevaluable');
  });

  it('does not treat null rental_blocked as confirmed safe', () => {
    expect(
      healthSeverityBand(
        buildHealth({
          overall_state: 'good',
          rental_blocked: null,
          availability: 'unavailable',
        }),
      ),
    ).toBe('unevaluable');
  });

  it('does not treat pipeline-degraded critical as critical band', () => {
    expect(
      healthSeverityBand(
        buildHealth({
          overall_state: 'critical',
          availability: 'unavailable',
          rental_blocked: null,
        }),
      ),
    ).toBe('unevaluable');
  });
});

describe('buildFleetHealthDisplay', () => {
  it('prioritises service overdue as primary, battery/tires as secondary, stale only as data note', () => {
    const health = buildHealth({
      overall_state: 'critical',
      rental_blocked: true,
      blocking_reasons: ['Service / TÜV überfällig seit 110 Tagen'],
      modules: {
        service_compliance: mod('critical', 'Service / TÜV überfällig seit 110 Tagen'),
        battery: mod('warning', 'Batterie beobachten'),
        tires: mod('warning', 'Reifen beobachten'),
        // stale-only modules must NOT become prominent issue chips
        brakes: mod('unknown', 'Keine aktuellen Bremsdaten', { data_stale: true }),
        vehicle_alerts: mod('unknown', 'Keine aktuellen Hinweise', { data_stale: true }),
      },
    });
    const d = buildFleetHealthDisplay(health);

    expect(d.band).toBe('blocked');
    expect(d.rentalBlocked).toBe(true);
    expect(d.primaryIssue).toBe('Service / TÜV überfällig seit 110 Tagen');
    expect(d.primaryModuleKey).toBe('service_compliance');

    const secondaryKeys = d.secondaryIssues.map((i) => i.key);
    expect(secondaryKeys).toContain('battery');
    expect(secondaryKeys).toContain('tires');
    // brakes/vehicle_alerts are stale (unknown) -> never real issues
    expect(secondaryKeys).not.toContain('brakes');
    expect(secondaryKeys).not.toContain('vehicle_alerts');

    // stale modules are summarised as data-quality only
    expect(d.dataQualityCount).toBe(2);
    expect(d.dataQualityNote).toBe('2 data notes');
  });

  it('does not produce a prominent stale chip for unknown + data_stale modules', () => {
    const health = buildHealth({
      overall_state: 'good',
      modules: {
        brakes: mod('unknown', 'Keine aktuellen Bremsdaten', { data_stale: true }),
      },
    });
    const d = buildFleetHealthDisplay(health);
    expect(d.secondaryIssues).toHaveLength(0);
    expect(d.primaryIssue).toBeNull();
    expect(d.dataQualityCount).toBe(1);
    expect(d.dataQualityNote).toBe('1 data note');
  });

  it('summarises OK/clear modules instead of rendering a chip flood', () => {
    const health = buildHealth({ overall_state: 'good' });
    const d = buildFleetHealthDisplay(health);
    expect(d.secondaryIssues).toHaveLength(0);
    expect(d.clearModuleCount).toBe(7);
    expect(d.primaryBadge.label).toBe('Healthy');
  });

  it('puts a warning/watch vehicle into needs_review with a primary issue', () => {
    const health = buildHealth({
      overall_state: 'warning',
      modules: { tires: mod('warning', 'Reifen beobachten') },
    });
    const d = buildFleetHealthDisplay(health);
    expect(d.group).toBe('needs_review');
    expect(d.primaryBadge.label).toBe('Needs review');
    expect(d.primaryIssue).toContain('Reifen beobachten');
  });

  it('keeps a stale-only vehicle in the good group (not action required)', () => {
    const health = buildHealth({
      overall_state: 'good',
      modules: {
        brakes: mod('unknown', 'Keine aktuellen Bremsdaten', { data_stale: true }),
        vehicle_alerts: mod('unknown', 'Keine aktuellen Hinweise', { data_stale: true }),
      },
    });
    expect(operatorGroupForVehicle(health)).toBe('good');
    const d = buildFleetHealthDisplay(health);
    expect(d.group).toBe('good');
    expect(d.band).toBe('good');
  });

  it('flags many limited modules as limited data coverage', () => {
    const health = buildHealth({
      overall_state: 'unknown',
      modules: {
        battery: mod('unknown', 'k.A.', { data_stale: true }),
        tires: mod('unknown', 'k.A.', { data_stale: true }),
        brakes: mod('n_a', 'Kein Tracking'),
        error_codes: mod('unknown', 'k.A.', { data_stale: true }),
      },
    });
    const d = buildFleetHealthDisplay(health);
    expect(d.band).toBe('limited');
    expect(d.dataQualityCount).toBeGreaterThanOrEqual(4);
    expect(d.dataQualityNote).toBe('Limited data coverage');
  });

  it('renders partial coverage with available module issues only', () => {
    const health = buildHealth({
      availability: 'partial',
      rental_blocked: null,
      overall_state: 'warning',
      modules: {
        tires: mod('warning', 'Reifen beobachten'),
        brakes: mod('unknown', 'Pipeline failed', { pipeline_available: false }),
      },
    });
    const d = buildFleetHealthDisplay(health);
    expect(d.band).toBe('unevaluable');
    expect(d.pipelineDegraded).toBe(true);
    expect(d.rentalBlockedUnverified).toBe(true);
    expect(d.primaryIssue).toBe('Technical status not fully available');
    expect(d.secondaryIssues.map((i) => i.key)).toEqual(['tires']);
    expect(d.clearModuleCount).toBeGreaterThan(0);
    expect(d.dataQualityNote).toBe('Partial module coverage');
  });

  it('uses neutral badge for unevaluable vehicles', () => {
    const d = buildFleetHealthDisplay(
      buildHealth({ availability: 'unavailable', rental_blocked: null }),
    );
    expect(d.primaryBadge.label).toBe('Not fully evaluable');
    expect(d.primaryBadge.tone).toBe('noData');
  });
});

describe('health severity ≠ data freshness', () => {
  it('data_stale on every module never downgrades a good vehicle below "good"', () => {
    const health = buildHealth({
      overall_state: 'good',
      modules: {
        battery: mod('good', 'OK', { data_stale: true }),
        tires: mod('good', 'OK', { data_stale: true }),
        brakes: mod('good', 'OK', { data_stale: true }),
        error_codes: mod('good', 'Clear', { data_stale: true }),
        service_compliance: mod('good', 'Aktuell', { data_stale: true }),
        complaints: mod('good', 'OK', { data_stale: true }),
        vehicle_alerts: mod('good', 'OK', { data_stale: true }),
      },
    });
    // Stale/soft-offline telemetry is a data-freshness concern, never health damage.
    expect(healthSeverityBand(health)).toBe('good');
    const d = buildFleetHealthDisplay(health);
    expect(d.band).toBe('good');
    expect(d.secondaryIssues).toHaveLength(0);
    expect(d.primaryIssue).toBeNull();
  });

  it('a stale-only good vehicle is neither action nor review', () => {
    const health = buildHealth({
      overall_state: 'good',
      modules: {
        brakes: mod('unknown', 'Keine aktuellen Daten', { data_stale: true }),
        vehicle_alerts: mod('unknown', 'Keine aktuellen Daten', { data_stale: true }),
      },
    });
    expect(matchesStatusFilter('action', health)).toBe(false);
    expect(matchesStatusFilter('review', health)).toBe(false);
    expect(matchesStatusFilter('good', health)).toBe(true);
  });
});

describe('grouping & filtering', () => {
  it('rental_blocked vehicle lands in action_required', () => {
    const health = buildHealth({ rental_blocked: true, overall_state: 'critical' });
    expect(operatorGroupForVehicle(health)).toBe('action_required');
    expect(matchesStatusFilter('action', health)).toBe(true);
    expect(matchesStatusFilter('review', health)).toBe(false);
  });

  it('warning vehicle matches the review filter, healthy matches good', () => {
    expect(matchesStatusFilter('review', buildHealth({ overall_state: 'warning' }))).toBe(true);
    expect(matchesStatusFilter('good', buildHealth({ overall_state: 'good' }))).toBe(true);
    expect(matchesStatusFilter('limited', buildHealth({ overall_state: 'unknown' }))).toBe(true);
    expect(matchesStatusFilter('limited', null)).toBe(true);
  });
});

describe('priorityRank / sorting', () => {
  it('ranks service-overdue (critical) above a stale-only good vehicle', () => {
    const serviceOverdue = buildHealth({
      overall_state: 'critical',
      modules: { service_compliance: mod('critical', 'Service überfällig') },
    });
    const staleOnly = buildHealth({
      overall_state: 'good',
      modules: { brakes: mod('unknown', 'Keine Daten', { data_stale: true }) },
    });
    expect(priorityRank(serviceOverdue)).toBeGreaterThan(priorityRank(staleOnly));
  });

  it('ranks blocked highest and no-data lowest', () => {
    expect(priorityRank(buildHealth({ rental_blocked: true }))).toBe(5);
    expect(priorityRank(null)).toBe(0);
  });
});

describe('computeFleetHealthKpis', () => {
  it('counts action/review/healthy/limited bands distinctly', () => {
    const map = new Map<string, VehicleHealthResponse>();
    map.set('a', buildHealth({ rental_blocked: true, overall_state: 'good' }));
    map.set('b', buildHealth({ overall_state: 'critical' }));
    map.set('c', buildHealth({ overall_state: 'warning' }));
    map.set('d', buildHealth({ overall_state: 'good' }));
    map.set('e', buildHealth({ overall_state: 'unknown' }));
    const kpis = computeFleetHealthKpis(['a', 'b', 'c', 'd', 'e', 'f'], map);

    expect(kpis.total).toBe(6);
    expect(kpis.actionRequired).toBe(2); // a (blocked) + b (critical)
    expect(kpis.needsReview).toBe(1); // c
    expect(kpis.healthy).toBe(1); // d
    expect(kpis.limited).toBe(2); // e (unknown) + f (no health)
    expect(kpis.unevaluable).toBe(1); // f (no health)
  });

  it('does not count unavailable critical vehicles as healthy or action required', () => {
    const map = new Map<string, VehicleHealthResponse>([
      [
        'degraded',
        buildHealth({
          overall_state: 'critical',
          availability: 'unavailable',
          rental_blocked: null,
        }),
      ],
    ]);
    const kpis = computeFleetHealthKpis(['degraded'], map);
    expect(kpis.actionRequired).toBe(0);
    expect(kpis.healthy).toBe(0);
    expect(kpis.unevaluable).toBe(1);
    expect(kpis.critical).toBe(0);
  });
});

describe('rentalGateLabel', () => {
  it('never shows can rent when rental gate is unverified', () => {
    const gate = rentalGateLabel(
      buildHealth({ availability: 'partial', rental_blocked: null, overall_state: 'good' }),
    );
    expect(gate.label).toBe('Not verified');
    expect(gate.tone).toBe('noData');
  });
});
