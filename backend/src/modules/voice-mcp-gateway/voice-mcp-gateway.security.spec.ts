import { VoiceMcpProtocolService } from './voice-mcp-protocol.service';
import { VoiceMcpGatewayMiddlewareService, VoiceMcpToolsService, VoiceMcpAuditService } from './voice-mcp-tools.service';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';
import { VoiceMcpRateLimitService } from './voice-mcp-rate-limit.service';
import { VOICE_MCP_READ_ONLY_TOOLS } from './voice-mcp-gateway.constants';
import { VoiceMcpError } from './voice-mcp-errors';

describe('VoiceMcpProtocolService security', () => {
  const middleware = {
    assertGatewayReady: jest.fn(),
    assertTenantBindings: jest.fn(),
    assertToolAllowed: jest.fn(),
  } as unknown as VoiceMcpGatewayMiddlewareService;

  const toolsService = {
    execute: jest.fn(),
  } as unknown as VoiceMcpToolsService;

  const auditService = {
    recordToolInvocation: jest.fn().mockResolvedValue(undefined),
  } as unknown as VoiceMcpAuditService;

  const nonceStore = {
    assertFreshRequestId: jest.fn().mockResolvedValue(true),
  } as unknown as VoiceMcpNonceStore;

  const rateLimitService = {
    assertWithinLimit: jest.fn().mockResolvedValue(undefined),
  } as unknown as VoiceMcpRateLimitService;

  const protocol = new VoiceMcpProtocolService(
    middleware,
    toolsService,
    auditService,
    nonceStore,
    rateLimitService,
  );

  const baseContext = {
    organizationId: 'org-1',
    voiceAssistantId: 'assistant-1',
    agentDeploymentId: 'deploy-1',
    conversationId: 'conv-1',
    allowedTools: [...VOICE_MCP_READ_ONLY_TOOLS],
    scopes: ['voice:mcp:read'],
    issuedAt: 1,
    expiresAt: 9999999999,
    nonce: 'nonce-1',
    requestId: 'req-1',
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOICE_AI_MCP_GATEWAY_ENABLED = 'true';
  });

  it('lists only token-allowed tools', async () => {
    const response = await protocol.handle(
      { ...baseContext, allowedTools: ['identify_customer'] },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    );

    expect((response as { result: { tools: Array<{ name: string }> } }).result.tools).toEqual([
      expect.objectContaining({ name: 'identify_customer' }),
    ]);
  });

  it('blocks tools that are not allowlisted in the token', async () => {
    (middleware.assertToolAllowed as jest.Mock).mockRejectedValueOnce(
      new VoiceMcpError('ToolNotAllowed', 'blocked'),
    );

    const response = await protocol.handle(
      { ...baseContext, allowedTools: ['identify_customer'] },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'find_booking', arguments: { search: 'ABC' } },
      },
    );

    expect((response as unknown as { error: { data: { code: string } } }).error.data.code).toBe(
      'ToolNotAllowed',
    );
    expect(middleware.assertToolAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'find_booking',
    );
  });

  it('rejects replayed request ids', async () => {
    (nonceStore.assertFreshRequestId as jest.Mock).mockResolvedValueOnce(false);

    await expect(
      protocol.handle(baseContext, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      }),
    ).rejects.toMatchObject({ code: 'RateLimited' });
  });

  it('enforces tenant middleware before tool execution', async () => {
    (toolsService.execute as jest.Mock).mockResolvedValue({ ok: true });

    await protocol.handle(baseContext, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'identify_customer', arguments: { phone: '+4912345' } },
    });

    expect(middleware.assertTenantBindings).toHaveBeenCalled();
    expect(toolsService.execute).toHaveBeenCalled();
    expect(auditService.recordToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'identify_customer',
      { phone: '+4912345' },
      'SUCCEEDED',
    );
  });

  it('returns structured tool errors without stack traces', async () => {
    (toolsService.execute as jest.Mock).mockRejectedValue(new Error('sql boom'));

    const response = await protocol.handle(baseContext, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'identify_customer', arguments: { phone: '+4912345' } },
    });

    const payload = JSON.parse(
      (response as { result: { content: Array<{ text: string }> } }).result.content[0].text,
    );
    expect(payload.code).toBe('DataUnavailable');
    expect(payload.message).not.toContain('sql');
  });
});
