import { VoiceMcpTokenService } from './voice-mcp-token.service';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';
import { VOICE_MCP_READ_ONLY_TOOLS } from './voice-mcp-gateway.constants';

describe('VoiceMcpTokenService', () => {
  const nonceStore = {
    registerIssuedNonce: jest.fn().mockResolvedValue(undefined),
    assertIssuedNonce: jest.fn().mockResolvedValue(true),
    revokeNonce: jest.fn(),
    assertFreshRequestId: jest.fn(),
  } as unknown as VoiceMcpNonceStore;

  const service = new VoiceMcpTokenService(nonceStore);

  beforeAll(() => {
    process.env.JWT_SECRET = 'voice-mcp-test-secret';
    process.env.VOICE_MCP_TOKEN_TTL_SECONDS = '300';
  });

  it('issues and verifies tenant-bound tokens', async () => {
    const { token } = await service.issue({
      organizationId: 'org-1',
      voiceAssistantId: 'assistant-1',
      agentDeploymentId: 'deploy-1',
      conversationId: 'conv-1',
      allowedTools: [...VOICE_MCP_READ_ONLY_TOOLS],
    });

    const claims = await service.verify(token, 'org-1');
    expect(claims.organizationId).toBe('org-1');
    expect(claims.conversationId).toBe('conv-1');
    expect(claims.allowedTools).toEqual(expect.arrayContaining(['identify_customer']));
  });

  it('rejects foreign organization binding', async () => {
    const { token } = await service.issue({
      organizationId: 'org-1',
      voiceAssistantId: 'assistant-1',
      agentDeploymentId: 'deploy-1',
      conversationId: 'conv-1',
      allowedTools: ['identify_customer'],
    });

    await expect(service.verify(token, 'org-foreign')).rejects.toMatchObject({
      code: 'TenantMismatch',
    });
  });

  it('rejects revoked or unknown nonce tokens', async () => {
    const { token } = await service.issue({
      organizationId: 'org-1',
      voiceAssistantId: 'assistant-1',
      agentDeploymentId: 'deploy-1',
      conversationId: 'conv-1',
      allowedTools: ['identify_customer'],
    });

    (nonceStore.assertIssuedNonce as jest.Mock).mockResolvedValueOnce(false);
    await expect(service.verify(token, 'org-1')).rejects.toMatchObject({
      code: 'InvalidToken',
    });
  });

  it('rejects expired tokens', async () => {
    const { token } = await service.issue({
      organizationId: 'org-1',
      voiceAssistantId: 'assistant-1',
      agentDeploymentId: 'deploy-1',
      conversationId: 'conv-expired',
      allowedTools: ['identify_customer'],
      ttlSeconds: -10,
    });

    await expect(service.verify(token, 'org-1')).rejects.toMatchObject({
      code: 'InvalidToken',
    });
  });
});
