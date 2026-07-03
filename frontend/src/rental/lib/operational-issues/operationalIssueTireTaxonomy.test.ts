import { describe, expect, it } from 'vitest';
import { mapOperationalIssueToActionQueueItem } from '../../components/dashboard/actionQueueBuilder';
import { buildFleetHealthDisplay } from '../fleet-health-control-center';
import type { RentalHealthModule, VehicleHealthResponse } from '../../../lib/api';
import {
  mapTireOperationalIssue,
  resolveTireOperationalBand,
  shouldShowTireInDashboardAttention,
} from './operationalIssueTireTaxonomy';
import {
  normalizeOperationalIssues,
  resolveRentalModuleOperationalSeverity,
  rentalModuleSeverityDetailLabel,
  shouldShowInDashboardAttention,
} from './index';

function runtimeState(overrides: {
  vehicleId: string;
  warningReasons?: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    source?: string;
    blocking?: boolean;
  }>;
}) {
  return {
    vehicleId: overrides.vehicleId,
    criticalReasons: [],
    blockReasons: [],
    notReadyReasons: [],
    warningReasons: overrides.warningReasons ?? [],
    telemetryState: 'live' as const,
  };
}

function tireHealth(reason: string, state: 'warning' | 'critical' = 'warning'): VehicleHealthResponse {
  const tireMod: RentalHealthModule = {
    state,
    reason,
    last_updated_at: '2026-06-22T00:00:00.000Z',
    data_stale: false,
  };
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: state,
    rental_blocked: false,
    blocking_reasons: [],
    generated_at: '2026-06-22T00:00:00.000Z',
    modules: {
      battery: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      tires: tireMod,
      brakes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      error_codes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      service_compliance: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      complaints: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      vehicle_alerts: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
    },
  };
}

describe('operationalIssueTireTaxonomy', () => {
  it('maps Reifen beobachten to warning band', () => {
    expect(resolveTireOperationalBand({ reason: 'Reifen beobachten', moduleState: 'warning' })).toBe('warning');
    expect(resolveTireOperationalBand({ reason: 'Monitor tires', moduleState: 'warning' })).toBe('warning');
  });

  it('maps forecast-only tires to none', () => {
    expect(resolveTireOperationalBand({ reason: 'Measured forecast only', moduleState: 'warning' })).toBe('none');
    expect(resolveTireOperationalBand({ reason: 'No action required', moduleState: 'warning' })).toBe('none');
  });

  it('maps critical tread to critical', () => {
    expect(resolveTireOperationalBand({ reason: 'Critical tread below limit', moduleState: 'critical' })).toBe('critical');
  });

  it('maps plain observe without action to notice', () => {
    expect(resolveTireOperationalBand({ reason: 'Observe tire wear trend', moduleState: 'good' })).toBe('notice');
    expect(shouldShowTireInDashboardAttention('notice')).toBe(false);
  });

  it('keeps dashboard attention for warning and critical only', () => {
    expect(shouldShowTireInDashboardAttention('warning')).toBe(true);
    expect(shouldShowTireInDashboardAttention('critical')).toBe(true);
    expect(shouldShowTireInDashboardAttention('none')).toBe(false);
  });
});

describe('tire severity across surfaces', () => {
  it('uses warning for Reifen beobachten in operational issues and dashboard queue', () => {
    const issues = normalizeOperationalIssues({
      vehicleRuntimeStates: [
        runtimeState({
          vehicleId: 'v1',
          warningReasons: [
            {
              id: 'tires',
              category: 'tires',
              severity: 'warning',
              title: 'Reifen beobachten',
              source: 'rental-health:tires',
              blocking: false,
            },
          ],
        }),
      ],
    });

    const tireIssue = issues.find((issue) => issue.issueType === 'tire_monitor');
    expect(tireIssue?.severity).toBe('warning');
    expect(shouldShowInDashboardAttention(tireIssue!)).toBe(true);

    const queueItem = mapOperationalIssueToActionQueueItem(tireIssue!, { locale: 'de' });
    expect(queueItem.severity).toBe('warning');
  });

  it('does not create dashboard notification for no-action tires', () => {
    const issues = normalizeOperationalIssues({
      vehicleRuntimeStates: [
        runtimeState({
          vehicleId: 'v1',
          warningReasons: [
            {
              id: 'tires-forecast',
              category: 'tires',
              severity: 'warning',
              title: 'Measured forecast only',
              source: 'rental-health:tires',
              blocking: false,
            },
          ],
        }),
      ],
    });

    expect(issues.some((issue) => issue.issueType.includes('tire'))).toBe(false);
  });

  it('aligns fleet health chip detail with canonical warning label', () => {
    const health = tireHealth('Reifen beobachten');
    health.modules.service_compliance = {
      state: 'warning',
      reason: 'Service bald fällig',
      last_updated_at: '2026-06-22T00:00:00.000Z',
      data_stale: false,
    };
    const display = buildFleetHealthDisplay(health);
    const chip = display.secondaryIssues.find((i) => i.key === 'tires');
    expect(chip?.detail).toBe('Warning');
  });

  it('uses the same module severity helper for fleet and rental health', () => {
    const module = { moduleKey: 'tires', state: 'warning', reason: 'Reifen beobachten' };
    expect(resolveRentalModuleOperationalSeverity(module)).toBe('warning');
    expect(rentalModuleSeverityDetailLabel(module, 'de')).toBe('Warnung');
    expect(mapTireOperationalIssue({ reason: 'Reifen beobachten', moduleState: 'warning' })?.severity).toBe('warning');
  });

  it('keeps critical tires critical everywhere', () => {
    const mapped = mapTireOperationalIssue({
      reason: 'Reifen kritisch — sofort ersetzen',
      moduleState: 'critical',
    });
    expect(mapped?.severity).toBe('critical');
    expect(mapped?.issueType).toBe('tire_critical');
    expect(rentalModuleSeverityDetailLabel(
      { moduleKey: 'tires', state: 'critical', reason: 'Reifen kritisch' },
      'de',
    )).toBe('Kritisch');
  });
});
