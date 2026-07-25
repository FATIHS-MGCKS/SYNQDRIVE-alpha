import { Test } from '@nestjs/testing';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import { WorkflowRiskCalculatorService } from './workflow-risk-calculator.service';
import { RISK_CLASS_RANK } from '../actions/workflow-action-registry.constants';
import { WORKFLOW_ACTION_POLICY_MATRIX } from '../policies/workflow-action-policy.matrix';
import { getActionRiskClass } from './workflow-risk.registry';

describe('WorkflowRiskCalculatorService', () => {
  let calculator: WorkflowRiskCalculatorService;
  const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkflowRiskCalculatorService, WorkflowActionSafetyBlockService],
    }).compile();
    calculator = module.get(WorkflowRiskCalculatorService);
  });

  it('classifies internal notification workflow as LOW', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'booking.returned' },
      actions: [{ type: 'notification.in_app.send' }],
    });
    expect(result.workflowRiskClass).toBe('LOW');
    expect(result.actions[0].baseRiskClass).toBe('LOW');
  });

  it('classifies task creation as LOW', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'booking.returned' },
      actions: [{ type: 'task.create' }],
    });
    expect(result.workflowRiskClass).toBe('LOW');
  });

  it('workflow risk is at least max action risk', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'booking.returned' },
      actions: [
        { type: 'task.create' },
        { type: 'sms.send' },
      ],
    });
    expect(RISK_CLASS_RANK[result.workflowRiskClass]).toBeGreaterThanOrEqual(
      RISK_CLASS_RANK[result.maxActionRiskClass],
    );
    expect(result.maxActionRiskClass).toBe('HIGH');
  });

  it('elevates AI plus external customer contact to at least HIGH', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'customer.complaint.created' },
      actions: [{ type: 'whatsapp.ai_message.send' }],
    });
    expect(RISK_CLASS_RANK[result.workflowRiskClass]).toBeGreaterThanOrEqual(
      RISK_CLASS_RANK.HIGH,
    );
    expect(result.combinationRules.some((r) => r.code === 'AI_PLUS_EXTERNAL_CONTACT')).toBe(true);
  });

  it('blocks activation for disabled CRITICAL actions', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'invoice.overdue' },
      actions: [{ type: 'booking.cancel' }],
    });
    expect(result.workflowRiskClass).toBe('CRITICAL');
    expect(result.blockedFromActivation).toBe(true);
    expect(result.activationBlockReasons.some((r) => r.includes('booking.cancel'))).toBe(true);
  });

  it('elevates critical trigger with customer contact', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'vehicle.health.critical' },
      actions: [{ type: 'email.send', config: {} }],
      eventType: 'vehicle.health.critical',
    });
    expect(RISK_CLASS_RANK[result.workflowRiskClass]).toBeGreaterThanOrEqual(
      RISK_CLASS_RANK.HIGH,
    );
  });

  it('applies safety override block', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'vehicle.dtc.critical' },
      actions: [{ type: 'sms.send' }],
      eventType: 'vehicle.dtc.critical',
      safetyOverrides: [
        { actionType: 'sms.send', blocked: true, reason: 'Incident response hold' },
      ],
    });
    expect(result.safetyBlocked).toBe(true);
    expect(result.safetyBlockReasons[0]).toContain('Incident response hold');
  });

  it('elevates multi-channel customer contact', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'booking.returned' },
      actions: [
        { type: 'email.send' },
        { type: 'sms.send' },
      ],
    });
    expect(result.combinationRules.some((r) => r.code === 'MULTI_CHANNEL_CUSTOMER_CONTACT')).toBe(
      true,
    );
  });

  it('CRITICAL policy binding requires maker-checker', () => {
    const result = calculator.assessWorkflow({
      organizationId: ORG,
      trigger: { type: 'invoice.overdue' },
      actions: [{ type: 'invoice.charge' }],
    });
    expect(result.policyBinding.makerCheckerRequired).toBe(true);
    expect(result.policyBinding.rolloutFlag).toBe('WORKFLOW_CRITICAL_ACTIONS');
  });

  it('lists risk registry with critical not generally available', () => {
    const registry = calculator.listRegistry();
    expect(registry.registryVersion).toBeTruthy();
    expect(registry.entries.length).toBeGreaterThan(10);
    expect(registry.criticalNotGenerallyAvailable.length).toBeGreaterThan(0);
    expect(
      registry.criticalNotGenerallyAvailable.some((e) => e.key === 'booking.cancel'),
    ).toBe(true);
  });
});

describe('Workflow risk registry ↔ policy matrix alignment', () => {
  it('policy matrix risk is not below registry floor for known actions', () => {
    for (const [actionType, policy] of Object.entries(WORKFLOW_ACTION_POLICY_MATRIX)) {
      const registryRisk = getActionRiskClass(actionType);
      expect(RISK_CLASS_RANK[policy.riskClass]).toBeGreaterThanOrEqual(
        RISK_CLASS_RANK[registryRisk],
      );
    }
  });
});
