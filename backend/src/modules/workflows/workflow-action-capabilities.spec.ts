import { BadRequestException } from '@nestjs/common';
import {
  assertWorkflowActionsCapable,
  buildWorkflowActionCapabilityPlan,
  collectWorkflowActionCapabilityIssues,
  listWorkflowActionCapabilities,
  resolveWorkflowActionType,
  WORKFLOW_ACTION_CAPABILITY_REVISION,
  WORKFLOW_ACTION_ERROR_CODES,
} from './workflow-action-capabilities';
import { validateWorkflowDefinition } from './workflow-definition.validator';
import { assessWorkflowActionRemediation } from './workflow-remediation.util';

describe('workflow-action-capabilities', () => {
  it('exposes auditable capability revision', () => {
    const list = listWorkflowActionCapabilities();
    expect(list.revision).toBe(WORKFLOW_ACTION_CAPABILITY_REVISION);
    expect(list.actions.length).toBeGreaterThan(10);
  });

  it('marks production MVP actions as AVAILABLE with handlers', () => {
    const list = listWorkflowActionCapabilities();
    for (const type of [
      'task.create',
      'alert.create',
      'vehicle.status.update',
      'notification.prepare',
      'workflow.approval.request',
      'ai.suggest_action',
    ]) {
      const entry = list.actions.find((a) => a.canonicalType === type);
      expect(entry?.status).toBe('AVAILABLE');
      expect(entry?.handlerRegistered).toBe(true);
      expect(entry?.selectableInUi).toBe(true);
    }
  });

  it('blocks provider channel actions as DISABLED', () => {
    for (const type of [
      'channel.email.send',
      'channel.whatsapp.send',
      'channel.sms.send',
      'voice.call.initiate',
    ]) {
      const entry = listWorkflowActionCapabilities().actions.find(
        (a) => a.canonicalType === type,
      );
      expect(entry?.status).toBe('DISABLED');
      expect(entry?.handlerRegistered).toBe(false);
      expect(entry?.selectableInUi).toBe(false);
    }
  });

  it('rejects unknown action types on save', () => {
    expect(() =>
      assertWorkflowActionsCapable(
        [{ type: 'totally.unknown.action', config: {} }],
        'save',
      ),
    ).toThrow(BadRequestException);
    const issues = collectWorkflowActionCapabilityIssues(
      [{ type: 'totally.unknown.action', config: {} }],
      'save',
    );
    expect(issues[0].code).toBe(WORKFLOW_ACTION_ERROR_CODES.UNKNOWN_ACTION);
  });

  it('rejects disabled AI execute actions', () => {
    const issues = collectWorkflowActionCapabilityIssues(
      [{ type: 'ai_execute', config: {} }],
      'save',
    );
    expect(issues[0].code).toBe(WORKFLOW_ACTION_ERROR_CODES.DISABLED_ACTION);
  });

  it('rejects unsupported cleaning status action', () => {
    const issues = collectWorkflowActionCapabilityIssues(
      [{ type: 'change_cleaning_status', config: {} }],
      'save',
    );
    expect(issues[0].code).toBe(WORKFLOW_ACTION_ERROR_CODES.UNSUPPORTED_ACTION);
  });

  it('flags incomplete vehicle status config', () => {
    const issues = collectWorkflowActionCapabilityIssues(
      [{ type: 'vehicle.status.update', config: { status: 'NOT_A_STATUS' } }],
      'save',
    );
    expect(issues[0].code).toBe(WORKFLOW_ACTION_ERROR_CODES.INVALID_CONFIG);
  });

  it('builds dry-run style plan without execution', () => {
    const plan = buildWorkflowActionCapabilityPlan([
      { type: 'create_task', config: { title: 'Check' } },
      { type: 'ai_execute', config: {} },
    ]);
    expect(plan[0].wouldExecute).toBe(true);
    expect(plan[1].wouldExecute).toBe(false);
    expect(plan[1].code).toBe(WORKFLOW_ACTION_ERROR_CODES.DISABLED_ACTION);
  });

  it('validator rejects unknown manipulated API action types', () => {
    expect(() =>
      validateWorkflowDefinition({
        name: 'Bad',
        category: 'maintenance',
        trigger: { type: 'manual.test' },
        actions: [{ type: 'channel.whatsapp.send', config: {} }],
      }),
    ).toThrow(BadRequestException);
  });

  it('validator rejects activation with disabled actions', () => {
    expect(() =>
      validateWorkflowDefinition({
        name: 'Bad',
        category: 'maintenance',
        trigger: { type: 'manual.test' },
        status: 'ACTIVE',
        actions: [{ type: 'task.create', config: { title: 'x' } }, { type: 'ai_execute', config: {} }],
      }),
    ).toThrow(BadRequestException);
  });

  it('assesses stored legacy invalid workflows for remediation', () => {
    const result = assessWorkflowActionRemediation({
      id: 'wf-1',
      actions: [{ type: 'assign_vendor', config: {} }],
    });
    expect(result.remediationRequired).toBe(true);
    expect(result.remediationReason).toContain('assign_vendor');
  });

  it('resolves legacy aliases to canonical types', () => {
    const resolved = resolveWorkflowActionType('create_task');
    expect(resolved.canonicalType).toBe('task.create');
    expect(resolved.definition?.status).toBe('AVAILABLE');
  });
});
