import { VoiceMcpActionOrchestratorService } from './voice-mcp-action-orchestrator.service';
import { VoiceMcpConfirmationService } from './voice-mcp-confirmation.service';
import { VoiceMcpApprovalService } from './voice-mcp-approval.service';
import { VoiceMcpWriteToolsService } from './voice-mcp-write-tools.service';
import { VoiceToolExecutionRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceMcpError } from './voice-mcp-errors';

describe('VoiceMcpActionOrchestratorService', () => {
  const confirmation = {
    createProposal: jest.fn(),
    consume: jest.fn(),
    summarizeAction: jest.fn().mockReturnValue('Create task summary'),
  } as unknown as VoiceMcpConfirmationService;

  const approval = {
    createPendingStaffApproval: jest.fn().mockResolvedValue({
      status: 'pending_staff_approval',
      approvalRequestId: 'apr-1',
    }),
  } as unknown as VoiceMcpApprovalService;

  const writeTools = {
    executeDomainAction: jest.fn().mockResolvedValue({ taskRef: 'ABCD1234' }),
  } as unknown as VoiceMcpWriteToolsService;

  const executions = {
    persistOrGet: jest.fn(),
    markRunning: jest.fn(),
    complete: jest.fn(),
  } as unknown as VoiceToolExecutionRepository;

  const orchestrator = new VoiceMcpActionOrchestratorService(
    confirmation,
    approval,
    writeTools,
    executions,
  );

  const context = {
    organizationId: 'org-1',
    voiceAssistantId: 'assistant-1',
    agentDeploymentId: 'deploy-1',
    conversationId: 'conv-1',
    allowedTools: ['create_task'],
    scopes: [],
    issuedAt: 1,
    expiresAt: 2,
    nonce: 'nonce',
    requestId: 'req-1',
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires customer confirmation on first call', async () => {
    (confirmation.createProposal as jest.Mock).mockResolvedValue({
      confirmationToken: 'confirm-1',
      parameterHash: 'hash-1',
      actionSummary: 'Create task',
      expiresAt: new Date().toISOString(),
    });

    await expect(
      orchestrator.executeWriteTool(context as never, 'create_task', { title: 'Follow up' }),
    ).rejects.toMatchObject({ code: 'ConfirmationRequired' });
  });

  it('creates staff approval after confirmed high-risk action', async () => {
    (executions.persistOrGet as jest.Mock).mockResolvedValue({
      execution: { id: 'exec-1', status: 'PENDING' },
      created: true,
    });

    const result = await orchestrator.executeWriteTool(context as never, 'create_task', {
      title: 'Follow up',
      confirmationToken: 'confirm-1',
    });

    expect(confirmation.consume).toHaveBeenCalled();
    expect(approval.createPendingStaffApproval).toHaveBeenCalled();
    expect(result.status).toBe('pending_staff_approval');
    expect(writeTools.executeDomainAction).not.toHaveBeenCalled();
  });

  it('executes callback request immediately after confirmation', async () => {
    (executions.persistOrGet as jest.Mock).mockResolvedValue({
      execution: { id: 'exec-2', status: 'PENDING' },
      created: true,
    });

    const result = await orchestrator.executeWriteTool(context as never, 'create_callback_request', {
      preferredPhone: '+491701234567',
      confirmationToken: 'confirm-2',
    });

    expect(writeTools.executeDomainAction).toHaveBeenCalledWith(
      'create_callback_request',
      expect.any(Object),
      expect.objectContaining({ preferredPhone: '+491701234567' }),
    );
    expect(result.status).toBe('completed');
  });

  it('returns existing result for idempotent retries', async () => {
    (confirmation.consume as jest.Mock).mockResolvedValue(undefined);
    (executions.persistOrGet as jest.Mock).mockResolvedValue({
      execution: {
        id: 'exec-3',
        status: 'SUCCEEDED',
        redactedOutput: { status: 'completed', taskRef: 'TASKREF1' },
      },
      created: false,
    });

    const result = await orchestrator.executeWriteTool(context as never, 'create_task', {
      title: 'Follow up',
      confirmationToken: 'confirm-3',
    });

    expect(result.status).toBe('already_completed');
    expect(writeTools.executeDomainAction).not.toHaveBeenCalled();
  });

  it('rejects prohibited tools', async () => {
    await expect(
      orchestrator.executeWriteTool(context as never, 'cancel_booking' as never, {}),
    ).rejects.toMatchObject({ code: 'ActionProhibited' });
  });
});

describe('VoiceMcpApprovalService security', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  const approvals = {
    expireStale: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'apr-1' }),
    decide: jest.fn(),
  };
  const executions = {
    markRunning: jest.fn(),
    complete: jest.fn(),
  };
  const writeTools = { executeDomainAction: jest.fn() };
  const tasksService = { createManualTask: jest.fn() };

  const service = new VoiceMcpApprovalService(
    prisma as never,
    approvals as never,
    executions as never,
    writeTools as never,
    tasksService as never,
  );

  it('rejects foreign staff approvers', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(service.approve('org-1', 'apr-1', 'user-foreign')).rejects.toBeInstanceOf(
      VoiceMcpError,
    );
  });

  it('rejects pending approval decisions from unauthorized users', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ role: 'MEMBER' });
    await expect(service.reject('org-1', 'apr-1', 'user-1')).rejects.toMatchObject({
      code: 'PermissionDenied',
    });
  });
});
