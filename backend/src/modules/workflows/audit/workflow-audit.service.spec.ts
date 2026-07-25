import { NotFoundException } from '@nestjs/common';
import { WorkflowAuditService } from './workflow-audit.service';

describe('WorkflowAuditService', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';

  const prisma = {
    orgWorkflowAuditEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const activityLog = {
    log: jest.fn(),
  };

  let service: WorkflowAuditService;

  beforeEach(() => {
    service = new WorkflowAuditService(prisma as never, activityLog as never);
    jest.clearAllMocks();
  });

  it('records governance events with redacted payloads', async () => {
    prisma.orgWorkflowAuditEvent.create.mockResolvedValue({ id: 'evt-1' });

    await service.record({
      orgId: orgA,
      eventType: 'WORKFLOW_PUBLISHED',
      workflowId: 'wf-1',
      summary: 'Published workflow',
      payload: {
        email: 'admin@tenant.com',
        token: 'secret-token-value',
      },
      actorUserId: 'user-1',
    });

    expect(prisma.orgWorkflowAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgA,
          eventType: 'WORKFLOW_PUBLISHED',
          retentionClass: 'GOVERNANCE_AUDIT',
          payload: expect.objectContaining({
            email: expect.not.stringContaining('admin@'),
            token: '[REDACTED]',
          }),
        }),
      }),
    );
    expect(activityLog.log).toHaveBeenCalled();
  });

  it('scopes audit reads to organization', async () => {
    prisma.orgWorkflowAuditEvent.findFirst.mockResolvedValue(null);

    await expect(service.getEvent(orgB, 'evt-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.orgWorkflowAuditEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'evt-foreign', organizationId: orgB },
    });
  });

  it('lists audit events for tenant only', async () => {
    prisma.orgWorkflowAuditEvent.findMany.mockResolvedValue([
      { id: 'evt-1', retentionClass: 'TECHNICAL_LOG' },
    ]);

    const result = await service.listEvents({ orgId: orgA, limit: 10 });

    expect(prisma.orgWorkflowAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: orgA },
      }),
    );
    expect(result.items).toHaveLength(1);
  });

  it('exposes retention metadata with legal hold disabled by default', () => {
    const metadata = service.getRetentionMetadata();
    expect(metadata.classes.every((row) => row.legalHoldAutoEnabled === false)).toBe(true);
    expect(metadata.classes.some((row) => row.retentionClass === 'GOVERNANCE_AUDIT')).toBe(true);
  });
});
