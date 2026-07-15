import { describe, expect, it } from 'vitest';
import type { TaskAutomationRuleDto } from './task-automation.types';
import {
  buildFormStateFromRule,
  buildOverridePayload,
  countOverriddenFields,
  isFieldOverridden,
  labelTaskAutomationSourceDe,
  parseChecklistOverrideForm,
} from './task-automation.utils';

const baseRule: TaskAutomationRuleDto = {
  ruleId: 'booking.lifecycle.confirmed.prep',
  catalogKey: 'BOOKING_PREPARATION',
  nameDe: 'Buchung vorbereiten',
  descriptionDe: 'Test',
  categoryDe: 'Buchung',
  isCritical: true,
  triggerLabelDe: 'Bei Buchungsbestätigung',
  activationLabelDe: 'Bei Buchungsbestätigung',
  dueLabelDe: 'Vor Übergabe',
  autoResolveLabelDe: 'Übergabe abgeschlossen',
  escalationLabelDe: 'Keine zusätzliche Eskalation',
  assignmentLabelDe: 'Station der Buchung',
  priorityLabelDe: 'Normal',
  checklistTemplateLabelDe: 'Vorbereitung (SynqDrive-Standard)',
  effectivelyEnabled: true,
  hasOrgOverride: false,
  configurableFields: [],
  allowedOverrideFields: [
    'enabled',
    'activationOffsetMinutes',
    'dueOffsetMinutes',
    'priority',
    'assignmentStrategy',
    'checklistOverrides',
  ],
  default: {
    enabled: true,
    activationOffsetMinutes: 0,
    dueOffsetMinutes: 0,
    priority: 'NORMAL',
    assignmentStrategy: 'STATION_FROM_BOOKING',
    assignedUserId: null,
    assignedRoleKey: null,
    stationScope: null,
    escalationConfig: null,
    notificationConfig: null,
    checklistOverrides: null,
    ruleConfig: {},
  },
  effective: {
    enabled: true,
    activationOffsetMinutes: 0,
    dueOffsetMinutes: 0,
    priority: 'NORMAL',
    assignmentStrategy: 'STATION_FROM_BOOKING',
    assignedUserId: null,
    assignedRoleKey: null,
    stationScope: null,
    escalationConfig: null,
    notificationConfig: null,
    checklistOverrides: null,
    ruleConfig: {},
  },
  fieldProvenance: {
    enabled: { value: true, source: 'PLATFORM_DEFAULT' },
    priority: { value: 'NORMAL', source: 'PLATFORM_DEFAULT' },
  },
  checklist: {
    platformItems: [],
    effectiveItems: [],
    allowsOverride: true,
    hasOverride: false,
    usesSynqDriveStandard: true,
  },
  audit: {
    version: null,
    updatedAt: null,
    updatedByUserId: null,
    updatedByName: null,
  },
};

describe('task-automation.utils', () => {
  it('labels provenance in German', () => {
    expect(labelTaskAutomationSourceDe('PLATFORM_DEFAULT')).toBe('SynqDrive-Standard');
    expect(labelTaskAutomationSourceDe('ORG_OVERRIDE')).toBe('Eigene Anpassung');
  });

  it('detects overridden fields', () => {
    expect(isFieldOverridden({ value: 'HIGH', source: 'ORG_OVERRIDE' })).toBe(true);
    expect(isFieldOverridden({ value: 'NORMAL', source: 'PLATFORM_DEFAULT' })).toBe(false);
    expect(countOverriddenFields(baseRule)).toBe(0);
  });

  it('builds override payload only for changed allowed fields', () => {
    const form = buildFormStateFromRule(baseRule);
    const payload = buildOverridePayload(baseRule, { ...form, priority: 'HIGH' });
    expect(payload.priority).toBe('HIGH');
    expect(payload.enabled).toBeUndefined();
  });

  it('parses checklist override form', () => {
    const parsed = parseChecklistOverrideForm({
      hiddenOptionalTitles: ['Zahlungsstatus geprüft'],
      additionalItems: [{ title: 'Winterreifen prüfen' }],
    });
    expect(parsed?.hiddenOptionalTitles).toEqual(['Zahlungsstatus geprüft']);
    expect(parsed?.additionalItems[0]?.title).toBe('Winterreifen prüfen');
  });

  it('marks disabled standard rule payload', () => {
    const form = buildFormStateFromRule(baseRule);
    const payload = buildOverridePayload(baseRule, { ...form, enabled: false });
    expect(payload.enabled).toBe(false);
  });
});
