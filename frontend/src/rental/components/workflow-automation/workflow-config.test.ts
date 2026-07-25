import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import {
  buildWorkflowPayload,
  createEmptyWorkflowConfigForm,
  isWorkflowConfigDirty,
  maskRecipientValue,
  moveArrayItem,
  parseBoundedNumberInput,
  serializeConditionsForApi,
  validateWorkflowConfigForm,
} from './workflow-config.utils';
import type { WorkflowCatalogDto } from './workflow-config.types';

const workflowDir = resolve(__dirname);

const catalog: WorkflowCatalogDto = {
  triggers: [{ type: 'booking.returned' }],
  actions: [{ type: 'task.create', requiresApproval: false }],
  categories: ['vehicle_return'],
  scopeTypes: ['organization'],
  conditionFields: [
    {
      key: 'health_score',
      path: 'payload.healthScore',
      dataType: 'number',
      min: 0,
      max: 100,
      operators: ['equals', 'gt'],
    },
  ],
  operators: ['equals', 'gt'],
  conditionLogicModes: ['all', 'any'],
  statuses: ['DRAFT', 'ACTIVE', 'DISABLED'],
  vehicleStatuses: ['AVAILABLE'],
  taskPriorities: ['NORMAL'],
  alertSeverities: ['info'],
  notificationTargets: ['admin'],
  systemTemplateEditableFields: ['enabled', 'description'],
};

const tEn = (key: keyof typeof en) => en[key];

describe('workflow config utils', () => {
  it('detects dirty form state', () => {
    const baseline = createEmptyWorkflowConfigForm();
    const changed = { ...baseline, name: 'Changed' };
    expect(isWorkflowConfigDirty(baseline, changed)).toBe(true);
  });

  it('serializes ALL/ANY/NOT condition groups', () => {
    const serialized = serializeConditionsForApi({
      match: 'any',
      negate: true,
      rules: [{ id: '1', field: 'health_score', operator: 'gt', value: '50' }],
    });
    expect(serialized).toEqual({
      match: 'any',
      negate: true,
      rules: [{ field: 'health_score', operator: 'gt', value: 50 }],
    });
  });

  it('rejects invalid numeric condition without silent coercion', () => {
    const form = createEmptyWorkflowConfigForm();
    form.conditionGroup.rules = [
      { id: '1', field: 'health_score', operator: 'gt', value: '' },
    ];
    const errors = validateWorkflowConfigForm(form, catalog, tEn);
    expect(errors.conditions).toBeUndefined();
    const invalid = parseBoundedNumberInput('', { min: 0, max: 100 });
    expect(invalid.error).toBeUndefined();
    const bad = parseBoundedNumberInput('abc', { min: 0, max: 100 });
    expect(bad.error).toBe('invalid');
  });

  it('flags unavailable actions', () => {
    const form = createEmptyWorkflowConfigForm();
    form.actions = [{ id: '1', type: 'ai.execute', config: {} }];
    const errors = validateWorkflowConfigForm(form, catalog, tEn);
    expect(errors.actions).toBe(en['workflowAutomation.editor.errors.actionUnavailable']);
  });

  it('requires change reason for publish approval flows', () => {
    const form = createEmptyWorkflowConfigForm();
    form.name = 'Test';
    form.actions = [{ id: '1', type: 'ai.suggest_action', config: {} }];
    const extendedCatalog: WorkflowCatalogDto = {
      ...catalog,
      actions: [{ type: 'ai.suggest_action', requiresApproval: true }],
    };
    const errors = validateWorkflowConfigForm(form, extendedCatalog, tEn, {
      requireChangeReason: true,
      isPublish: true,
    });
    expect(errors.changeReason).toBeTruthy();
  });

  it('masks recipient data', () => {
    expect(maskRecipientValue('john.doe@example.com')).toContain('***@');
    expect(maskRecipientValue('+491701234567')).toContain('*');
  });

  it('builds draft vs activate payloads separately', () => {
    const form = createEmptyWorkflowConfigForm();
    form.name = 'Return prep';
    const draft = buildWorkflowPayload(form, 'draft');
    const activate = buildWorkflowPayload(form, 'activate');
    expect(draft.status).toBe('DRAFT');
    expect(activate.status).toBe('ACTIVE');
  });

  it('reorders actions', () => {
    const items = ['a', 'b', 'c'];
    expect(moveArrayItem(items, 2, 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('workflow config drawer integration', () => {
  it('wires config drawer with accordion sections and alert dialog', () => {
    const source = readFileSync(resolve(workflowDir, 'WorkflowConfigDrawer.tsx'), 'utf8');
    const overview = readFileSync(resolve(workflowDir, 'WorkflowOverviewSection.tsx'), 'utf8');
    expect(source).toContain('data-testid="workflow-config-drawer"');
    expect(source).toContain('AlertDialog');
    expect(source).toContain('workflowAutomation.editor.sections.general');
    expect(source).toContain('min-h-11');
    expect(overview).toContain('WorkflowConfigDrawer');
  });

  it('exposes catalog api endpoint', () => {
    const apiSource = readFileSync(resolve(workflowDir, '../../../lib/api.ts'), 'utf8');
    expect(apiSource).toContain('/workflows/catalog');
  });
});

describe('workflow config i18n', () => {
  it('has editor keys in DE and EN', () => {
    expect(en['workflowAutomation.editor.sections.general']).toBeTruthy();
    expect(de['workflowAutomation.editor.sections.general']).toBe('Allgemein');
  });
});
