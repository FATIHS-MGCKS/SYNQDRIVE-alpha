import {
  buildAiCallOpeningScript,
  buildAiMessageTransparency,
} from './workflow-ai-transparency.util';
import {
  hashWorkflowAuditPayload,
  sanitizeWorkflowAuditValue,
  scanWorkflowAuditPayloadForSecrets,
  summarizeWorkflowError,
} from './workflow-audit-sanitize.util';
import { WORKFLOW_AUDIT_RETENTION_DAYS } from './workflow-audit.constants';

describe('workflow-audit-sanitize', () => {
  it('masks phone numbers and emails', () => {
    const result = sanitizeWorkflowAuditValue({
      phone: '+49 170 1234567',
      email: 'customer@example.com',
    }) as Record<string, string>;

    expect(result.phone).toContain('***');
    expect(result.email).toContain('@example.com');
    expect(result.email).not.toContain('customer@');
  });

  it('redacts tokens and document numbers', () => {
    const result = sanitizeWorkflowAuditValue({
      apiKey: 'sk_live_abcdefghijklmnopqrstuvwxyz',
      documentNumber: 'AB-123456-DE',
    }) as Record<string, string>;

    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.documentNumber).toBe('[REDACTED]');
  });

  it('truncates message bodies', () => {
    const longMessage = 'x'.repeat(200);
    const result = sanitizeWorkflowAuditValue({
      messageBody: longMessage,
    }) as Record<string, string>;

    expect(result.messageBody.length).toBeLessThanOrEqual(120);
  });

  it('detects secret leaks in audit payloads', () => {
    const violations = scanWorkflowAuditPayloadForSecrets({
      nested: { token: 'plain-secret-value' },
    });
    expect(violations).toContain('nested.token');
  });

  it('summarizes errors without leaking secrets', () => {
    const summary = summarizeWorkflowError(
      new Error('Failed for user@secret.com with token sk_test_1234567890abcdef'),
    );
    expect(summary).not.toContain('sk_test');
    expect(summary).not.toContain('user@secret.com');
  });

  it('hashes sanitized payloads consistently', () => {
    const hashA = hashWorkflowAuditPayload({ workflowId: 'wf-1', status: 'ACTIVE' });
    const hashB = hashWorkflowAuditPayload({ workflowId: 'wf-1', status: 'ACTIVE' });
    expect(hashA).toBe(hashB);
  });
});

describe('workflow-ai-transparency', () => {
  it('marks AI messages with organization responsibility', () => {
    const transparency = buildAiMessageTransparency('Acme Fleet GmbH', 'message');
    expect(transparency.generatedByAi).toBe(true);
    expect(transparency.responsibleOrganization).toBe('Acme Fleet GmbH');
    expect(transparency.humanAgentClaim).toBe(false);
    expect(transparency.aiDisclosure).toContain('digital assistant');
    expect(transparency.modelId).toBeTruthy();
    expect(transparency.promptVersion).toBeTruthy();
  });

  it('opens AI calls with digital assistant disclosure', () => {
    const script = buildAiCallOpeningScript('Acme Fleet GmbH');
    expect(script).toContain('digital assistant');
    expect(script).toContain('Acme Fleet GmbH');
    expect(script).toContain('assisted by AI');
  });
});

describe('workflow-audit retention metadata', () => {
  it('defines separate retention classes', () => {
    expect(WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG).toBeLessThan(
      WORKFLOW_AUDIT_RETENTION_DAYS.REVISION_AUDIT,
    );
    expect(WORKFLOW_AUDIT_RETENTION_DAYS.REVISION_AUDIT).toBeLessThan(
      WORKFLOW_AUDIT_RETENTION_DAYS.GOVERNANCE_AUDIT,
    );
  });
});
