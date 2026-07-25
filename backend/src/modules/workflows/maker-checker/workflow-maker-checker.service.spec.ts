import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { WorkflowMakerCheckerService } from './workflow-maker-checker.service';
import { computeWorkflowDefinitionHash, buildDefinitionSnapshot } from './workflow-maker-checker.util';

describe('WorkflowMakerCheckerService', () => {
  const orgId = 'org-a';
  const makerId = 'user-maker';
  const checkerId = 'user-checker';
  const otherOrgId = 'org-b';

  const prisma: {
    orgWorkflowChangeRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    orgWorkflow: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    orgWorkflowApproval: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    orgWorkflowChangeRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflow: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    orgWorkflowApproval: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };

  let service: WorkflowMakerCheckerService;

  const highRiskWorkflow = {
    id: 'wf-1',
    organizationId: orgId,
    name: 'Critical comms',
    description: null,
    category: 'ai_permissions',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [{ type: 'ai.suggest_action', config: {} }],
    scope: { type: 'organization' },
    status: 'DRAFT',
    version: 3,
    updatedById: makerId,
  };

  let checkerPermissionSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    service = new WorkflowMakerCheckerService(prisma as never, {
      recordFireAndForget: jest.fn(),
    } as never);
    checkerPermissionSpy = jest
      .spyOn(service as any, 'assertCheckerPermission')
      .mockResolvedValue(undefined);
    jest.clearAllMocks();
    checkerPermissionSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    checkerPermissionSpy.mockRestore();
  });

  it('blocks self-approval on change requests', async () => {
    const snapshot = buildDefinitionSnapshot(highRiskWorkflow as any);
    const hash = computeWorkflowDefinitionHash(snapshot);
    prisma.orgWorkflowChangeRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      organizationId: orgId,
      workflowId: 'wf-1',
      status: 'PENDING',
      makerUserId: makerId,
      proposedDefinitionHash: hash,
      proposedStatus: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      decisionVersion: 1,
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(highRiskWorkflow);

    await expect(
      service.approveChangeRequest({
        orgId,
        requestId: 'req-1',
        checker: { id: makerId, platformRole: 'ORG_ADMIN' },
        checkerReason: 'Looks good',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('invalidates approval when workflow changed after request', async () => {
    const staleHash = computeWorkflowDefinitionHash(
      buildDefinitionSnapshot({ ...highRiskWorkflow, version: 2 } as any),
    );
    const currentHash = computeWorkflowDefinitionHash(
      buildDefinitionSnapshot(highRiskWorkflow as any),
    );
    expect(staleHash).not.toBe(currentHash);

    prisma.orgWorkflowChangeRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      organizationId: orgId,
      workflowId: 'wf-1',
      status: 'PENDING',
      makerUserId: makerId,
      proposedDefinitionHash: staleHash,
      proposedStatus: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      decisionVersion: 1,
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(highRiskWorkflow);
    prisma.orgWorkflowChangeRequest.update.mockResolvedValue({});

    await expect(
      service.approveChangeRequest({
        orgId,
        requestId: 'req-1',
        checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
        checkerReason: 'Approved after review',
      }),
    ).rejects.toThrow(/changed after approval request/);
  });

  it('rejects expired approvals', async () => {
    prisma.orgWorkflowApproval.updateMany.mockResolvedValue({ count: 0 });
    prisma.orgWorkflowApproval.findFirst.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
      decisionVersion: 1,
      makerUserId: makerId,
    });

    await expect(
      service.approveRuntimeAction({
        orgId,
        approval: {
          id: 'appr-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 60_000),
          decisionVersion: 1,
          makerUserId: makerId,
        } as any,
        actionRunId: 'ar-1',
        workflowVersion: 3,
        definitionHash: 'abc',
        checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
        checkerReason: 'ok',
      }),
    ).rejects.toThrow(/expired/);
  });

  it('denies foreign tenant via org-scoped lookup', async () => {
    prisma.orgWorkflowChangeRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.approveChangeRequest({
        orgId: otherOrgId,
        requestId: 'req-1',
        checker: { id: checkerId, platformRole: 'MASTER_ADMIN' },
        checkerReason: 'hack',
      }),
    ).rejects.toThrow(/not found/);
  });

  it('allows two independent users for approval', async () => {
    const snapshot = buildDefinitionSnapshot(highRiskWorkflow as any);
    const hash = computeWorkflowDefinitionHash(snapshot);
    prisma.orgWorkflowChangeRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      organizationId: orgId,
      workflowId: 'wf-1',
      status: 'PENDING',
      makerUserId: makerId,
      proposedDefinitionHash: hash,
      proposedStatus: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      decisionVersion: 1,
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(highRiskWorkflow);
    prisma.orgWorkflowChangeRequest.update.mockResolvedValue({
      id: 'req-1',
      status: 'APPROVED',
    });
    prisma.orgWorkflow.update.mockResolvedValue({
      ...highRiskWorkflow,
      status: 'ACTIVE',
    });

    const result = await service.approveChangeRequest({
      orgId,
      requestId: 'req-1',
      checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
      checkerReason: 'Second pair of eyes confirmed',
    });

    expect(result.workflow.status).toBe('ACTIVE');
  });

  it('requires emergency reason for override path', async () => {
    await expect(
      service.approveChangeRequest({
        orgId,
        requestId: 'req-1',
        checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
        checkerReason: 'Emergency',
        emergency: { reason: 'short' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects concurrent parallel decisions via decisionVersion', async () => {
    prisma.orgWorkflowChangeRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      organizationId: orgId,
      workflowId: 'wf-1',
      status: 'PENDING',
      makerUserId: makerId,
      proposedDefinitionHash: 'hash',
      proposedStatus: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      decisionVersion: 2,
    });

    await expect(
      service.approveChangeRequest({
        orgId,
        requestId: 'req-1',
        checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
        checkerReason: 'late decision',
        expectedDecisionVersion: 1,
      }),
    ).rejects.toThrow(/Concurrent decision/);
  });

  it('requires checker reason on runtime approval', async () => {
    await expect(
      service.approveRuntimeAction({
        orgId,
        approval: {
          id: 'appr-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
          decisionVersion: 1,
        } as any,
        actionRunId: 'ar-1',
        workflowVersion: 1,
        definitionHash: 'hash',
        checker: { id: checkerId, platformRole: 'ORG_ADMIN' },
        checkerReason: '   ',
      }),
    ).rejects.toThrow(/Checker approval reason is required/);
  });
});
