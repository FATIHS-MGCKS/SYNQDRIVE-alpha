import { Test } from '@nestjs/testing';
import { WorkflowActionPolicyService } from './workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from './workflow-action-safety-block.service';
import { buildPolicySnapshot } from './workflow-action-policy.snapshot';
import { getWorkflowActionPolicy } from './workflow-action-policy.matrix';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('WorkflowActionPolicyService', () => {
  let policyService: WorkflowActionPolicyService;
  let safetyBlocks: WorkflowActionSafetyBlockService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkflowActionPolicyService, WorkflowActionSafetyBlockService],
    }).compile();
    policyService = module.get(WorkflowActionPolicyService);
    safetyBlocks = module.get(WorkflowActionSafetyBlockService);
  });

  it('enforces server-side risk class and rejects client downgrade', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'ai.suggest_action',
      eventType: 'manual.test',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_AI_SUGGEST'],
      clientRiskClass: 'LOW',
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'RISK_DOWNGRADE')).toBe(true);
  });

  it('denies missing permission', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'vehicle.status.update',
      eventType: 'vehicle.health.warning',
      entityType: 'vehicle',
      scopeType: 'vehicle',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'PERMISSION_DENIED')).toBe(true);
  });

  it('rejects disallowed trigger combination', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'booking.flag',
      eventType: 'manual.test',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'TRIGGER_NOT_ALLOWED')).toBe(true);
  });

  it('rejects disallowed scope for ai.suggest_action', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'ai.suggest_action',
      eventType: 'manual.test',
      scopeType: 'vehicle',
      actorPermissions: ['WORKFLOW_AI_SUGGEST'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'SCOPE_NOT_ALLOWED')).toBe(true);
  });

  it('requires approval for CRITICAL execute without approval', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'ai.suggest_action',
      eventType: 'manual.test',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_AI_SUGGEST'],
      mode: 'execute',
      runApproved: false,
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.violations.some((v) => v.code === 'APPROVAL_REQUIRED')).toBe(true);
  });

  it('uses frozen snapshot for approved runs when policy changes', () => {
    const policy = getWorkflowActionPolicy('task.create')!;
    const frozen = buildPolicySnapshot({
      ...policy,
      policyVersion: '2026-06-legacy',
      riskClass: 'LOW',
    });

    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'task.create',
      eventType: 'manual.test',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'execute',
      frozenSnapshot: frozen,
      runApproved: true,
    });

    expect(result.useFrozenSnapshot).toBe(true);
    expect(result.snapshot.snapshotHash).toBe(frozen.snapshotHash);
    expect(result.policy.riskClass).toBe('LOW');
  });

  it('re-evaluates policy when not approved and snapshot is stale', () => {
    const policy = getWorkflowActionPolicy('task.create')!;
    const stale = buildPolicySnapshot({
      ...policy,
      policyVersion: '2026-01-old',
      riskClass: 'LOW',
    });

    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'task.create',
      eventType: 'manual.test',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'execute',
      frozenSnapshot: stale,
      runApproved: false,
    });

    expect(result.useFrozenSnapshot).toBe(false);
    expect(result.policy.riskClass).toBe('MEDIUM');
  });

  it('applies safety block even on frozen approved snapshot', () => {
    const policy = getWorkflowActionPolicy('task.create')!;
    const frozen = buildPolicySnapshot(policy);
    safetyBlocks.blockAction('task.create', 'Incident response hold');

    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'task.create',
      eventType: 'manual.test',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'execute',
      frozenSnapshot: frozen,
      runApproved: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.safetyBlocked).toBe(true);
    expect(result.violations.some((v) => v.code === 'SAFETY_BLOCK')).toBe(true);
  });

  it('blocks unverified diagnosis on critical vehicle triggers for customer email', () => {
    for (const actionType of ['customer.contact.email', 'email.send']) {
      const result = policyService.evaluate({
        organizationId: ORG,
        actionType,
        eventType: 'vehicle.dtc.critical',
        entityType: 'customer',
        scopeType: 'organization',
        actorPermissions: ['WORKFLOW_CUSTOMER_CONTACT'],
        mode: 'execute',
        actionConfig: { body: 'DTC P0420 detected' },
      });
      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.code === 'UNVERIFIED_DIAGNOSIS')).toBe(true);
    }
  });

  it('allows email.send preview when capability enabled', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'email.send',
      eventType: 'booking.returned',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_CUSTOMER_CONTACT'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(true);
    expect(result.policy.capabilityGate).toBe('ENABLED');
  });

  it('allows whatsapp.template.send preview when capability enabled', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'whatsapp.template.send',
      eventType: 'booking.returned',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_CUSTOMER_CONTACT'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(true);
    expect(result.policy.capabilityGate).toBe('ENABLED');
  });

  it('blocks whatsapp.ai_message.send when capability disabled', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'whatsapp.ai_message.send',
      eventType: 'booking.returned',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_CUSTOMER_CONTACT'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'CAPABILITY_DISABLED')).toBe(true);
  });

  it('allows voice.call.start preview when capability enabled', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'voice.call.start',
      eventType: 'invoice.overdue',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_VOICE_CALL'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(true);
    expect(result.policy.capabilityGate).toBe('ENABLED');
  });

  it('allows sms.send preview when capability enabled', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'sms.send',
      eventType: 'booking.returned',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_CUSTOMER_CONTACT'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(true);
    expect(result.policy.capabilityGate).toBe('ENABLED');
  });

  it('rejects cross-tenant evaluation without organizationId', () => {
    const result = policyService.evaluate({
      organizationId: '',
      actionType: 'task.create',
      eventType: 'booking.returned',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'TENANT_VIOLATION')).toBe(true);
  });

  it('captures policy snapshot with hash', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'notification.in_app.send',
      eventType: 'booking.returned',
      entityType: 'booking',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_EXECUTE'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(true);
    expect(result.snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.snapshot.riskClass).toBe('MEDIUM');
  });

  it('keeps disabled CRITICAL actions blocked', () => {
    const result = policyService.evaluate({
      organizationId: ORG,
      actionType: 'invoice.charge',
      eventType: 'invoice.overdue',
      scopeType: 'organization',
      actorPermissions: ['WORKFLOW_INVOICE_CHARGE'],
      mode: 'preview',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.code === 'CAPABILITY_DISABLED')).toBe(true);
    expect(result.policy.riskClass).toBe('CRITICAL');
  });
});
