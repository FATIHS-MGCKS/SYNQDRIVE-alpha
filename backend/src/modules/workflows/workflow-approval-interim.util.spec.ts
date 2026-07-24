import { BadRequestException } from '@nestjs/common';
import {
  approvalExpiresAt,
  assertApproverNotSelf,
  assertWorkflowActivatableWithApprovalPolicy,
  isApprovalExpired,
  isApprovalGatedAction,
  WORKFLOW_APPROVAL_ERROR_CODES,
  WORKFLOW_APPROVAL_RESUME_SUPPORTED,
} from './workflow-approval-interim.util';

describe('workflow-approval-interim.util', () => {
  describe('isApprovalGatedAction', () => {
    it('detects inherently approval-gated actions', () => {
      expect(isApprovalGatedAction({ type: 'ai.suggest_action', config: {} })).toBe(true);
      expect(isApprovalGatedAction({ type: 'workflow.approval.request', config: {} })).toBe(true);
    });

    it('detects explicit requiresApproval flag', () => {
      expect(
        isApprovalGatedAction({ type: 'task.create', config: {}, requiresApproval: true }),
      ).toBe(true);
    });

    it('returns false for standard actions', () => {
      expect(isApprovalGatedAction({ type: 'task.create', config: {} })).toBe(false);
    });
  });

  describe('assertWorkflowActivatableWithApprovalPolicy', () => {
    it('blocks ACTIVE workflows with approval-gated actions while resume is unsupported', () => {
      expect(WORKFLOW_APPROVAL_RESUME_SUPPORTED).toBe(false);
      expect(() =>
        assertWorkflowActivatableWithApprovalPolicy(
          [{ type: 'ai.suggest_action', config: {} }],
          'ACTIVE',
        ),
      ).toThrow(BadRequestException);
    });

    it('allows DRAFT workflows with approval-gated actions', () => {
      expect(() =>
        assertWorkflowActivatableWithApprovalPolicy(
          [{ type: 'ai.suggest_action', config: {} }],
          'DRAFT',
        ),
      ).not.toThrow();
    });

    it('allows ACTIVE workflows without approval-gated actions', () => {
      expect(() =>
        assertWorkflowActivatableWithApprovalPolicy(
          [{ type: 'task.create', config: {} }],
          'ACTIVE',
        ),
      ).not.toThrow();
    });
  });

  describe('approval expiry helpers', () => {
    it('computes expiry 72h ahead', () => {
      const from = new Date('2026-07-01T12:00:00.000Z');
      const expires = approvalExpiresAt(from);
      expect(expires.toISOString()).toBe('2026-07-04T12:00:00.000Z');
    });

    it('detects expired approvals', () => {
      const past = new Date(Date.now() - 1000);
      expect(isApprovalExpired(past)).toBe(true);
      expect(isApprovalExpired(approvalExpiresAt())).toBe(false);
    });
  });

  describe('assertApproverNotSelf', () => {
    it('blocks workflow creator self-approval', () => {
      expect(() =>
        assertApproverNotSelf({
          approverUserId: 'user-1',
          workflowCreatedById: 'user-1',
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: WORKFLOW_APPROVAL_ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
          }),
        }),
      );
    });

    it('blocks triggerer self-approval', () => {
      expect(() =>
        assertApproverNotSelf({
          approverUserId: 'user-1',
          runPayload: { triggeredByUserId: 'user-1' },
        }),
      ).toThrow(BadRequestException);
    });
  });
});
