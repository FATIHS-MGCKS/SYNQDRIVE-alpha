import { describe, expect, it } from 'vitest';
import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  rowSeverityLabel,
  runtimeReasonTooltip,
} from './reasonDisplay';
import type { RuntimeReason } from './runtime';

function reason(overrides: Partial<RuntimeReason> = {}): RuntimeReason {
  return {
    id: overrides.id ?? 'r1',
    category: overrides.category ?? 'tires',
    severity: overrides.severity ?? 'warning',
    title: overrides.title ?? 'Reifen prüfen',
    source: overrides.source ?? 'rental-health:tires',
    blocking: overrides.blocking,
    preventsReady: overrides.preventsReady,
    description: overrides.description,
  };
}

describe('formatRuntimeReasonLabel', () => {
  it('returns only the readable title, never the technical source', () => {
    const label = formatRuntimeReasonLabel(reason({ title: 'Reifen prüfen', source: 'rental-health:tires' }), 'de');
    expect(label).toBe('Reifen prüfen');
    expect(label).not.toContain('rental-health');
    expect(label).not.toContain('·');
  });

  it('does not leak any known technical source id into the label', () => {
    const sources = [
      'rental-health:tires',
      'rental-health:battery',
      'rental-health:error_codes',
      'dashboard-health-risk',
      'vehicle-runtime',
      'dashboard-insight:SERVICE_OVERDUE',
    ];
    for (const source of sources) {
      const label = formatRuntimeReasonLabel(reason({ title: 'Service überfällig', source }), 'de');
      expect(label).toBe('Service überfällig');
      expect(label).not.toContain(source);
    }
  });

  it('falls back to a category label when the title is empty', () => {
    expect(formatRuntimeReasonLabel(reason({ title: '', category: 'battery' }), 'de')).toBe('Batterie prüfen');
    expect(formatRuntimeReasonLabel(reason({ title: '', category: 'battery' }), 'en')).toBe('Check battery');
  });
});

describe('runtimeReasonTooltip', () => {
  it('keeps the source discoverable on hover only', () => {
    const tip = runtimeReasonTooltip(reason({ title: 'Reifen prüfen', source: 'rental-health:tires' }), 'de');
    expect(tip).toContain('rental-health:tires');
    expect(tip).toContain('Quelle');
  });

  it('returns undefined when there is no source', () => {
    const noSource: RuntimeReason = {
      id: 'r1',
      category: 'tires',
      severity: 'warning',
      title: 'Reifen prüfen',
    };
    expect(runtimeReasonTooltip(noSource, 'de')).toBeUndefined();
  });
});

describe('dedupeDisplayReasons', () => {
  it('drops the generic dashboard-health-risk fallback when a concrete rental-health reason exists', () => {
    const reasons = [
      reason({ id: 'tires', category: 'tires', title: 'Reifen prüfen', source: 'rental-health:tires' }),
      reason({ id: 'risk', category: 'health', title: 'Health review required', source: 'dashboard-health-risk' }),
    ];
    const result = dedupeDisplayReasons(reasons);
    expect(result.some((r) => r.source === 'dashboard-health-risk')).toBe(false);
    expect(result.some((r) => r.source === 'rental-health:tires')).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('keeps the generic health-risk fallback when no concrete module reason exists', () => {
    const reasons = [
      reason({ id: 'risk', category: 'health', title: 'Health review required', source: 'dashboard-health-risk' }),
    ];
    const result = dedupeDisplayReasons(reasons);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('dashboard-health-risk');
  });

  it('hides pure vehicle-runtime ready markers from the visible pills', () => {
    const reasons = [
      reason({ id: 'ready', category: 'rental', severity: 'info', title: 'Mietbereit', source: 'vehicle-runtime' }),
    ];
    expect(dedupeDisplayReasons(reasons)).toHaveLength(0);
  });

  it('de-duplicates reasons with the same category and normalized title', () => {
    const reasons = [
      reason({ id: 'a', category: 'dtc', title: 'Fehlercodes prüfen', source: 'rental-health:error_codes' }),
      reason({ id: 'b', category: 'dtc', title: 'Fehlercodes  prüfen', source: 'dashboard-insight:DTC' }),
    ];
    expect(dedupeDisplayReasons(reasons)).toHaveLength(1);
  });
});

describe('rowSeverityLabel', () => {
  it('maps severities to readable labels and hides neutral', () => {
    expect(rowSeverityLabel('success', 'en')).toBe('Ready');
    expect(rowSeverityLabel('warning', 'de')).toBe('Warnung');
    expect(rowSeverityLabel('critical', 'de')).toBe('Kritisch');
    expect(rowSeverityLabel('info', 'de')).toBe('Info');
    expect(rowSeverityLabel('neutral', 'de')).toBeNull();
  });
});
