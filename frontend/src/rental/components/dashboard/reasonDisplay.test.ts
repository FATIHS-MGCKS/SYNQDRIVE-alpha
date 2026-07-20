import { describe, expect, it } from 'vitest';
import {
  buildRuntimeReasonDisplayRows,
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  formatWorkStatusLabel,
  groupDisplayReasons,
  resolveRuntimeReasonDisplayGroup,
  rowSeverityLabel,
  runtimeReasonActionHint,
  runtimeReasonDisplayGroupLabel,
  runtimeReasonSourceLabel,
  runtimeReasonTooltip,
  stripVisibleUuidText,
} from './reasonDisplay';
import type { RuntimeReason } from './runtime';
import {
  SERVICE_CASE_RUNTIME_REASON_CODE,
} from './runtime/serviceCaseRuntimeReasons';
import { TASK_RUNTIME_REASON_CODE } from './runtime/taskRuntimeReasons';

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
    reasonCode: overrides.reasonCode,
    serviceCaseId: overrides.serviceCaseId,
    taskId: overrides.taskId,
    parentReasonId: overrides.parentReasonId,
    status: overrides.status,
    scheduledAt: overrides.scheduledAt,
    expectedReadyAt: overrides.expectedReadyAt,
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
    expect(formatRuntimeReasonLabel(reason({ title: '', category: 'battery', source: '' }), 'de')).toBe('Batterie prüfen');
    expect(formatRuntimeReasonLabel(reason({ title: '', category: 'battery', source: '' }), 'en')).toBe('Check battery');
  });

  it('strips UUIDs from visible labels', () => {
    const label = formatRuntimeReasonLabel(
      reason({
        title: 'Servicefall 8f3e2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b Bremsen',
        source: 'SERVICE_CASE',
      }),
      'de',
    );
    expect(label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(label).toContain('Servicefall');
    expect(label).toContain('Bremsen');
  });

  it('prefixes linked child tasks without implying a second blocker', () => {
    expect(
      formatRuntimeReasonLabel(
        reason({
          id: 'child',
          source: 'TASK',
          title: 'Bremsbeläge tauschen',
          parentReasonId: 'parent',
          blocking: false,
        }),
        'de',
      ),
    ).toBe('Aufgabe: Bremsbeläge tauschen');
  });
});

describe('runtime reason display groups', () => {
  it('maps service, task, technical and operational categories', () => {
    expect(resolveRuntimeReasonDisplayGroup(reason({ source: 'SERVICE_CASE', category: 'operational' }))).toBe(
      'service_case_block',
    );
    expect(resolveRuntimeReasonDisplayGroup(reason({ source: 'TASK', category: 'operational' }))).toBe('task_block');
    expect(resolveRuntimeReasonDisplayGroup(reason({ source: 'rental-health:tires', category: 'tires' }))).toBe(
      'technical_block',
    );
    expect(resolveRuntimeReasonDisplayGroup(reason({ category: 'damage' }))).toBe('damage');
    expect(resolveRuntimeReasonDisplayGroup(reason({ category: 'compliance' }))).toBe('compliance');
    expect(resolveRuntimeReasonDisplayGroup(reason({ category: 'cleaning' }))).toBe('cleaning');
    expect(resolveRuntimeReasonDisplayGroup(reason({ category: 'telemetry', source: 'telemetry' }))).toBe('telemetry');
    expect(resolveRuntimeReasonDisplayGroup(reason({ category: 'handover', source: 'booking-runtime:return-overdue' }))).toBe(
      'booking_operational',
    );
  });

  it('localizes group labels in DE and EN', () => {
    expect(runtimeReasonDisplayGroupLabel('service_case_block', 'de')).toBe('Servicefall blockiert');
    expect(runtimeReasonDisplayGroupLabel('service_case_block', 'en')).toBe('Service case blocks rental');
    expect(runtimeReasonDisplayGroupLabel('technical_block', 'de')).toBe('Technische Blockade');
    expect(runtimeReasonDisplayGroupLabel('task_block', 'en')).toBe('Task blocks rental');
  });
});

describe('runtimeReasonSourceLabel and action hints', () => {
  it('keeps work source separate from technical health source', () => {
    expect(runtimeReasonSourceLabel(reason({ source: 'SERVICE_CASE' }), 'de')).toBe('Servicefall');
    expect(runtimeReasonSourceLabel(reason({ source: 'TASK' }), 'de')).toBe('Aufgabe');
    expect(runtimeReasonSourceLabel(reason({ source: 'rental-health:tires' }), 'de')).toBe('Rental Health');
    expect(runtimeReasonActionHint(reason({ source: 'SERVICE_CASE' }), 'de')).toBe('Servicefall öffnen');
    expect(runtimeReasonActionHint(reason({ source: 'TASK' }), 'en')).toBe('Work task');
    expect(runtimeReasonActionHint(reason({ source: 'rental-health:battery' }), 'de')).toBe('Health prüfen');
  });

  it('uses work status labels only in tooltip metadata, not as the main label', () => {
    expect(formatWorkStatusLabel('IN_PROGRESS', 'de')).toBe('In Bearbeitung');
    const tip = runtimeReasonTooltip(
      reason({
        source: 'SERVICE_CASE',
        title: 'Karosserie',
        status: 'WAITING_VENDOR',
        reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
      }),
      'de',
    );
    expect(tip).toContain('Arbeitsstatus: Wartet auf Werkstatt');
    expect(formatRuntimeReasonLabel(reason({ source: 'SERVICE_CASE', title: 'Karosserie', status: 'WAITING_VENDOR' }), 'de')).toBe(
      'Karosserie',
    );
  });
});

describe('groupDisplayReasons', () => {
  it('groups case-only blocking reasons under service_case_block', () => {
    const groups = groupDisplayReasons(
      [
        reason({
          id: 'case',
          source: 'SERVICE_CASE',
          title: 'Getriebe Diagnose',
          category: 'operational',
          severity: 'critical',
          blocking: true,
          reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
          serviceCaseId: 'sc-1',
          status: 'IN_PROGRESS',
        }),
      ],
      'de',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('service_case_block');
    expect(groups[0]?.rows[0]?.label).toBe('Getriebe Diagnose');
    expect(groups[0]?.rows[0]?.sourceLabel).toBe('Servicefall');
  });

  it('groups task-only blocking reasons under task_block', () => {
    const groups = groupDisplayReasons(
      [
        reason({
          id: 'task',
          source: 'TASK',
          title: 'Reinigung blockiert',
          category: 'operational',
          severity: 'critical',
          blocking: true,
          reasonCode: TASK_RUNTIME_REASON_CODE,
          taskId: 'task-1',
          status: 'OPEN',
        }),
      ],
      'en',
    );

    expect(groups[0]?.id).toBe('task_block');
    expect(groups[0]?.rows[0]?.label).toBe('Reinigung blockiert');
    expect(groups[0]?.rows[0]?.actionHint).toBe('Work task');
  });

  it('renders linked task+case as parent case and child task without duplicate block labels', () => {
    const parent = reason({
      id: 'case-parent',
      source: 'SERVICE_CASE',
      title: 'Bremsen Service',
      category: 'operational',
      severity: 'critical',
      blocking: true,
      reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
      serviceCaseId: 'sc-1',
    });
    const child = reason({
      id: 'task-child',
      source: 'TASK',
      title: 'Bremsbeläge tauschen',
      category: 'operational',
      severity: 'warning',
      blocking: false,
      reasonCode: TASK_RUNTIME_REASON_CODE,
      taskId: 'task-1',
      parentReasonId: 'case-parent',
      status: 'IN_PROGRESS',
    });

    const rows = buildRuntimeReasonDisplayRows([parent, child], 'de');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe('Bremsen Service');
    expect(rows[0]?.isChild).toBe(false);
    expect(rows[1]?.label).toBe('Aufgabe: Bremsbeläge tauschen');
    expect(rows[1]?.isChild).toBe(true);
    expect(rows.filter((row) => row.reason.blocking === true)).toHaveLength(1);
  });

  it('keeps technical health reasons separate from operational work reasons', () => {
    const groups = groupDisplayReasons(
      [
        reason({ id: 'health', source: 'rental-health:tires', category: 'tires', title: 'Reifen kritisch', blocking: true }),
        reason({
          id: 'case',
          source: 'SERVICE_CASE',
          category: 'operational',
          title: 'Werkstatt',
          blocking: true,
          reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
        }),
      ],
      'de',
    );

    expect(groups.map((group) => group.id)).toEqual(['technical_block', 'service_case_block']);
  });
});

describe('runtimeReasonTooltip', () => {
  it('keeps the source discoverable on hover only', () => {
    const tip = runtimeReasonTooltip(reason({ title: 'Reifen prüfen', source: 'rental-health:tires' }), 'de');
    expect(tip).toContain('rental-health:tires');
    expect(tip).toContain('Kategorie');
  });

  it('returns undefined when there is no source', () => {
    const noSource: RuntimeReason = {
      id: 'r1',
      category: 'tires',
      severity: 'warning',
      title: 'Reifen prüfen',
    };
    expect(runtimeReasonTooltip(noSource, 'de')).toContain('Reifen prüfen');
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
    expect(formatRuntimeReasonLabel(result[0]!, 'de')).toBe('Health prüfen');
  });

  it('formats service window and raw source-only reasons as user-facing labels', () => {
    expect(
      formatRuntimeReasonLabel(
        reason({ category: 'service', title: 'Service Window Available', source: 'dashboard-insight:SERVICE_WINDOW' }),
        'de',
      ),
    ).toBe('Servicefenster verfügbar');
    expect(
      formatRuntimeReasonLabel(
        reason({ category: 'dtc', title: 'rental-health:error_codes', source: 'rental-health:error_codes' }),
        'de',
      ),
    ).toBe('Fehlercodes prüfen');
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

  it('drops generic service overdue when a specific overdue label exists', () => {
    const reasons = [
      reason({ category: 'service', title: 'Service überfällig', source: 'dashboard-insight:SERVICE_OVERDUE' }),
      reason({
        id: 'specific',
        category: 'service',
        title: 'Service überfällig seit 117 Tagen (HM/OEM)',
        source: 'rental-health:service_compliance',
      }),
    ];
    const result = dedupeDisplayReasons(reasons);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toContain('117 Tagen');
  });

  it('keeps linked child tasks when parent service case exists', () => {
    const result = dedupeDisplayReasons([
      reason({ id: 'case', source: 'SERVICE_CASE', title: 'Bremsen Service', serviceCaseId: 'sc-1' }),
      reason({
        id: 'task',
        source: 'TASK',
        title: 'Bremsbeläge tauschen',
        taskId: 'task-1',
        parentReasonId: 'case',
      }),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('stripVisibleUuidText', () => {
  it('removes uuid tokens from visible text', () => {
    expect(stripVisibleUuidText('Fall 8f3e2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b offen')).toBe('Fall offen');
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
