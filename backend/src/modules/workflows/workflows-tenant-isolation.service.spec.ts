import { NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makePrisma() {
  return {
    orgWorkflow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    orgWorkflowRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflowActionRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflowApproval: {
      updateMany: jest.fn(),
    },
    vehicle: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
  } as any;
}

describe('WorkflowsService tenant isolation', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: WorkflowsService;
  const tenantGuard = {
    assertOrganizationId: (id: string) => id,
    validateScopeDefinition: jest.fn().mockResolvedValue(undefined),
    validateEventEntities: jest.fn().mockResolvedValue(undefined),
    validateEntityRefs: jest.fn().mockResolvedValue(undefined),
    tryValidateEntityRefs: jest.fn().mockResolvedValue(null),
  };
  const workflowDryRun = {
    buildExecutionPlan: jest.fn(),
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new WorkflowsService(
      prisma,
      {} as any,
      {} as any,
      workflowDryRun as any,
      tenantGuard as any,
    );
  });

  it('findById rejects foreign workflow id', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue(null);
    await expect(service.findById(ORG_A, 'wf-foreign')).rejects.toThrow(NotFoundException);
    expect(prisma.orgWorkflow.findFirst).toHaveBeenCalledWith({
      where: { id: 'wf-foreign', organizationId: ORG_A },
    });
  });

  it('getRun rejects foreign workflow run', async () => {
    prisma.orgWorkflowRun.findFirst.mockResolvedValue(null);
    await expect(service.getRun(ORG_A, 'run-foreign')).rejects.toThrow('Workflow run not found');
  });

  it('approveActionRun rejects foreign approval action run', async () => {
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(null);
    await expect(service.approveActionRun(ORG_A, 'ar-foreign')).rejects.toThrow(
      'Action run not found',
    );
  });

  it('rejectActionRun rejects foreign approval action run', async () => {
    prisma.orgWorkflowActionRun.findFirst.mockResolvedValue(null);
    await expect(service.rejectActionRun(ORG_B, 'ar-foreign')).rejects.toThrow(
      'Action run not found',
    );
  });

  it('discardDraft uses organizationId and draft guards in deleteMany', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: 'wf-1',
      organizationId: ORG_A,
      status: 'DRAFT',
      publishedAt: null,
      triggerCount: 0,
    });
    prisma.orgWorkflowRun.count.mockResolvedValue(0);
    prisma.orgWorkflow.deleteMany.mockResolvedValue({ count: 1 });
    await service.discardDraft(ORG_A, 'wf-1');
    expect(prisma.orgWorkflow.deleteMany).toHaveBeenCalledWith({
      where: { id: 'wf-1', organizationId: ORG_A, status: 'DRAFT', publishedAt: null },
    });
  });

  it('archive rejects foreign workflow id', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue(null);
    await expect(service.archive(ORG_B, 'wf-foreign', 'u1', 'Admin', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });
});
