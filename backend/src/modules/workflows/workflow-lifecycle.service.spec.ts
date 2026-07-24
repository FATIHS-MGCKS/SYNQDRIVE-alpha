import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const WF_ID = 'wf-1';

function makePrisma() {
  return {
    orgWorkflow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
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

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const tenantGuard = {
    assertOrganizationId: (id: string) => id,
    validateScopeDefinition: jest.fn().mockResolvedValue(undefined),
    validateEventEntities: jest.fn().mockResolvedValue(undefined),
    validateEntityRefs: jest.fn().mockResolvedValue(undefined),
    tryValidateEntityRefs: jest.fn().mockResolvedValue(null),
  };
  return new WorkflowsService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    tenantGuard as any,
  );
}

describe('WorkflowsService lifecycle', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: WorkflowsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('archives an active workflow with audit metadata', async () => {
    const existing = {
      id: WF_ID,
      organizationId: ORG_A,
      status: 'ACTIVE',
      publishedAt: new Date('2026-01-01'),
      triggerCount: 4,
      enabled: true,
    };
    prisma.orgWorkflow.findFirst.mockResolvedValue(existing);
    prisma.orgWorkflowRun.count.mockResolvedValue(2);
    prisma.orgWorkflow.updateMany.mockResolvedValue({ count: 1 });
    prisma.orgWorkflow.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        status: 'ARCHIVED',
        enabled: false,
        archivedAt: new Date('2026-07-24'),
        archivedById: 'user-1',
        archivedByName: 'Admin',
        archiveReason: 'Replaced by v2',
      });

    const result = await service.archive(ORG_A, WF_ID, 'user-1', 'Admin', 'Replaced by v2');

    expect(prisma.orgWorkflow.updateMany).toHaveBeenCalledWith({
      where: { id: WF_ID, organizationId: ORG_A },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        enabled: false,
        archiveReason: 'Replaced by v2',
        archivedById: 'user-1',
        archivedByName: 'Admin',
      }),
    });
    expect(result).toMatchObject({ status: 'ARCHIVED' });
  });

  it('requires archive reason for published or executed workflows', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: WF_ID,
      organizationId: ORG_A,
      status: 'ACTIVE',
      publishedAt: new Date(),
      triggerCount: 0,
    });
    prisma.orgWorkflowRun.count.mockResolvedValue(0);

    await expect(service.archive(ORG_A, WF_ID, 'user-1', 'Admin')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects archive for foreign organization workflow', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue(null);
    await expect(service.archive(ORG_B, WF_ID, 'user-1', 'Admin', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('discards only pure unpublished drafts without dependencies', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: WF_ID,
      organizationId: ORG_A,
      status: 'DRAFT',
      publishedAt: null,
      triggerCount: 0,
    });
    prisma.orgWorkflowRun.count.mockResolvedValue(0);
    prisma.orgWorkflow.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.discardDraft(ORG_A, WF_ID);

    expect(result).toEqual({ discarded: true });
    expect(prisma.orgWorkflow.deleteMany).toHaveBeenCalledWith({
      where: { id: WF_ID, organizationId: ORG_A, status: 'DRAFT', publishedAt: null },
    });
  });

  it('blocks discard for published or executed workflows', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: WF_ID,
      organizationId: ORG_A,
      status: 'DRAFT',
      publishedAt: null,
      triggerCount: 1,
    });
    prisma.orgWorkflowRun.count.mockResolvedValue(0);

    await expect(service.discardDraft(ORG_A, WF_ID)).rejects.toThrow(BadRequestException);
    expect(prisma.orgWorkflow.deleteMany).not.toHaveBeenCalled();
  });

  it('listRuns remains readable after archive', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: WF_ID,
      organizationId: ORG_A,
      status: 'ARCHIVED',
    });
    prisma.orgWorkflowRun.findMany.mockResolvedValue([
      { id: 'run-1', workflowId: WF_ID, status: 'SUCCESS', actionRuns: [] },
    ]);

    const runs = await service.listRuns(ORG_A, WF_ID, 10);

    expect(runs).toHaveLength(1);
    expect(prisma.orgWorkflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_A, workflowId: WF_ID },
      }),
    );
  });

  it('getRun keeps approval history readable', async () => {
    prisma.orgWorkflowRun.findFirst.mockResolvedValue({
      id: 'run-1',
      organizationId: ORG_A,
      workflowId: WF_ID,
      actionRuns: [],
      approvals: [{ id: 'ap-1', status: 'APPROVED' }],
      workflow: { id: WF_ID, name: 'Archived WF', version: 2 },
    });

    const run = await service.getRun(ORG_A, 'run-1');

    expect(run.approvals).toHaveLength(1);
    expect(run.workflow?.name).toBe('Archived WF');
  });

  it('excludes archived workflows from default list', async () => {
    prisma.orgWorkflow.findMany.mockResolvedValue([]);
    await service.findByOrg(ORG_A);
    expect(prisma.orgWorkflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_A,
          status: { in: expect.arrayContaining(['DRAFT', 'ACTIVE', 'DISABLED']) },
        }),
      }),
    );
  });
});

describe('WorkflowEngineService archived exclusion', () => {
  it('does not match archived workflows', async () => {
    const prisma = makePrisma();
    prisma.orgWorkflow.findMany.mockResolvedValue([]);
    const engine = new WorkflowEngineService(prisma, {} as any, {} as any);

    await engine.findMatchingWorkflows({
      organizationId: ORG_A,
      type: 'manual.test',
      payload: {},
    });

    expect(prisma.orgWorkflow.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_A,
        status: 'ACTIVE',
        enabled: true,
        archivedAt: null,
      },
    });
  });
});
