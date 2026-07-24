import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkflowApprovalInterimService } from './workflow-approval-interim.service';
import { approvalExpiresAt, WORKFLOW_APPROVAL_ERROR_CODES } from './workflow-approval-interim.util';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_ADMIN = 'user-admin';
const USER_CREATOR = 'user-creator';

function makePrisma() {
  const tx = jest.fn((ops: unknown[]) => Promise.all(ops));
  return {
    orgWorkflowActionRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orgWorkflowApproval: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orgWorkflowRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: tx,
  } as any;
}

function pendingBundle(expiresAt?: Date) {
  const past = new Date(Date.now() - 60_000);
  const future = expiresAt ?? approvalExpiresAt();
  return {
    actionRun: {
      id: 'ar-1',
      organizationId: ORG_A,
      workflowRunId: 'run-1',
      status: 'WAITING_APPROVAL',
      workflowRun: {
        id: 'run-1',
        organizationId: ORG_A,
        inputPayload: { manualTest: true },
        workflow: { id: 'wf-1', createdById: 'other-user', name: 'WF' },
        approvals: [
          {
            id: 'ap-1',
            organizationId: ORG_A,
            status: 'PENDING',
            expiresAt: future,
            reason: 'Needs review',
          },
        ],
      },
    },
    expiredAt: past,
  };
}

describe('WorkflowApprovalInterimService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: WorkflowApprovalInterimService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new WorkflowApprovalInterimService(prisma);
    prisma.orgWorkflowRun.findFirst.mockResolvedValue({
      id: 'run-1',
      organizationId: ORG_A,
      status: 'WAITING_APPROVAL',
      actionRuns: [{ id: 'ar-1', status: 'APPROVED_PENDING_EXECUTION' }],
      approvals: [{ id: 'ap-1', status: 'APPROVED_PENDING_EXECUTION' }],
      workflow: { id: 'wf-1', name: 'WF', version: 1 },
    });
  });

  it('approves into APPROVED_PENDING_EXECUTION without completing the run', async () => {
    const bundle = pendingBundle();
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    const result = await service.approveActionRun(
      ORG_A,
      'ar-1',
      { id: USER_ADMIN, name: 'Admin', roles: ['ORG_ADMIN'] },
      'Looks good',
    );

    expect(prisma.orgWorkflowApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED_PENDING_EXECUTION',
          approvedByUserId: USER_ADMIN,
          decidedByName: 'Admin',
        }),
      }),
    );
    expect(prisma.orgWorkflowActionRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED_PENDING_EXECUTION',
          finishedAt: null,
        }),
      }),
    );
    expect(prisma.orgWorkflowRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'WAITING_APPROVAL', finishedAt: null }),
      }),
    );
    expect(result.status).toBe('WAITING_APPROVAL');
  });

  it('blocks duplicate approval decisions', async () => {
    const bundle = pendingBundle();
    bundle.actionRun.status = 'APPROVED_PENDING_EXECUTION';
    bundle.actionRun.workflowRun.approvals[0].status = 'APPROVED_PENDING_EXECUTION';
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await expect(
      service.approveActionRun(ORG_A, 'ar-1', { id: USER_ADMIN, roles: ['ORG_ADMIN'] }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
      }),
    });
  });

  it('rejects foreign tenant approval attempts', async () => {
    const bundle = pendingBundle();
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await expect(
      service.approveActionRun(ORG_B, 'ar-1', { id: USER_ADMIN, roles: ['ORG_ADMIN'] }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WORKFLOW_APPROVAL_ERROR_CODES.FOREIGN_TENANT,
      }),
    });
  });

  it('rejects self-approval by workflow creator', async () => {
    const bundle = pendingBundle();
    bundle.actionRun.workflowRun.workflow.createdById = USER_CREATOR;
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await expect(
      service.approveActionRun(ORG_A, 'ar-1', { id: USER_CREATOR, roles: ['ORG_ADMIN'] }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WORKFLOW_APPROVAL_ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
      }),
    });
  });

  it('expires stale approvals and fails the run', async () => {
    const bundle = pendingBundle(new Date(Date.now() - 60_000));
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await expect(
      service.approveActionRun(ORG_A, 'ar-1', { id: USER_ADMIN, roles: ['ORG_ADMIN'] }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WORKFLOW_APPROVAL_ERROR_CODES.EXPIRED,
      }),
    });
    expect(prisma.orgWorkflowApproval.updateMany).toHaveBeenCalled();
    expect(prisma.orgWorkflowRun.updateMany).toHaveBeenCalled();
  });

  it('rejects with audit metadata and fails the run', async () => {
    const bundle = pendingBundle();
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await service.rejectActionRun(
      ORG_A,
      'ar-1',
      { id: USER_ADMIN, name: 'Admin', roles: ['ORG_ADMIN'] },
      'Too risky',
    );

    expect(prisma.orgWorkflowApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          reason: 'Too risky',
          decidedByName: 'Admin',
        }),
      }),
    );
    expect(prisma.orgWorkflowRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('blocks approvers without workflow roles when roles are provided', async () => {
    const bundle = pendingBundle();
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(bundle.actionRun);

    await expect(
      service.approveActionRun(ORG_A, 'ar-1', { id: USER_ADMIN, roles: ['VIEWER'] }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WORKFLOW_APPROVAL_ERROR_CODES.INSUFFICIENT_PERMISSION,
      }),
    });
  });
});

describe('workflow approval activation policy', () => {
  it('blocks activating workflows with approval-gated actions', async () => {
    const { assertWorkflowActivatableWithApprovalPolicy } = await import(
      './workflow-approval-interim.util'
    );
    expect(() =>
      assertWorkflowActivatableWithApprovalPolicy(
        [{ type: 'ai.suggest_action', config: {} }],
        'ACTIVE',
      ),
    ).toThrow(BadRequestException);
  });
});
