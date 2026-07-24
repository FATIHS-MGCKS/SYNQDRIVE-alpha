import { BadRequestException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

function makePrisma() {
  return {
    orgWorkflow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    orgWorkflowRun: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orgWorkflowActionRun: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflowApproval: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  } as any;
}

describe('WorkflowsService action capabilities', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: WorkflowsService;
  const engine = { executeWorkflow: jest.fn() };

  beforeEach(() => {
    prisma = makePrisma();
    service = new WorkflowsService(prisma, {} as any, engine as any, {
      approveActionRun: jest.fn(),
      rejectActionRun: jest.fn(),
    } as any);
  });

  it('previewWorkflowActions returns non-executing capability plan', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: 'wf-1',
      name: 'Test',
      remediationRequired: false,
      remediationReason: null,
      actions: [
        { type: 'create_task', config: { title: 'A' } },
        { type: 'ai_execute', config: {} },
      ],
    });

    const result = await service.previewWorkflowActions('org-a', 'wf-1');

    expect(result.executed).toBe(false);
    expect(result.plannedActions).toHaveLength(2);
    expect(result.plannedActions[0].wouldExecute).toBe(true);
    expect(result.plannedActions[1].wouldExecute).toBe(false);
    expect(engine.executeWorkflow).not.toHaveBeenCalled();
  });

  it('testWorkflow blocks execution when actions are invalid', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: 'wf-1',
      organizationId: 'org-a',
      actions: [{ type: 'ai_execute', config: {} }],
    });

    const result = await service.testWorkflow('org-a', 'wf-1', {});

    expect(result.executed).toBe(false);
    expect(result.runIds).toEqual([]);
    expect(engine.executeWorkflow).not.toHaveBeenCalled();
  });

  it('toggleStatus blocks activation when stored actions are invalid', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue({
      id: 'wf-1',
      organizationId: 'org-a',
      status: 'DISABLED',
      actions: [{ type: 'assign_vendor', config: {} }],
    });

    await expect(service.toggleStatus('org-a', 'wf-1')).rejects.toThrow(BadRequestException);
    expect(prisma.orgWorkflow.update).not.toHaveBeenCalled();
  });
});
