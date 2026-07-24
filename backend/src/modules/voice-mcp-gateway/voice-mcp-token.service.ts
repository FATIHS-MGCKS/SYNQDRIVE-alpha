import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  resolveVoiceMcpTokenSecret,
  resolveVoiceMcpTokenTtlSeconds,
} from './voice-mcp-gateway.config';
import { VOICE_MCP_TOKEN_TYPE, type VoiceMcpToolName } from './voice-mcp-gateway.constants';
import { VoiceMcpError } from './voice-mcp-errors';
import type { VoiceMcpTokenClaims } from './voice-mcp-context.types';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';

type IssueVoiceMcpTokenInput = {
  organizationId: string;
  voiceAssistantId: string;
  agentDeploymentId: string;
  conversationId: string;
  allowedTools: VoiceMcpToolName[];
  scopes?: string[];
  audience?: string | null;
  ttlSeconds?: number;
};

@Injectable()
export class VoiceMcpTokenService {
  constructor(private readonly nonceStore: VoiceMcpNonceStore) {}

  async issue(input: IssueVoiceMcpTokenInput): Promise<{ token: string; claims: VoiceMcpTokenClaims }> {
    const ttlSeconds = input.ttlSeconds ?? resolveVoiceMcpTokenTtlSeconds();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + ttlSeconds;
    const nonce = randomUUID();

    const claims: VoiceMcpTokenClaims = {
      organizationId: input.organizationId,
      voiceAssistantId: input.voiceAssistantId,
      agentDeploymentId: input.agentDeploymentId,
      conversationId: input.conversationId,
      allowedTools: input.allowedTools,
      scopes: input.scopes ?? ['voice:mcp:read'],
      issuedAt,
      expiresAt,
      nonce,
      audience: input.audience ?? null,
    };

    await this.nonceStore.registerIssuedNonce(nonce, ttlSeconds + 60);

    const token = jwt.sign(
      {
        typ: VOICE_MCP_TOKEN_TYPE,
        org: claims.organizationId,
        vai: claims.voiceAssistantId,
        adp: claims.agentDeploymentId,
        cid: claims.conversationId,
        tools: claims.allowedTools,
        scopes: claims.scopes,
        jti: claims.nonce,
        aud: claims.audience ?? undefined,
      },
      resolveVoiceMcpTokenSecret(),
      {
        expiresIn: ttlSeconds,
        issuer: 'synqdrive-voice-mcp',
        subject: claims.conversationId,
      },
    );

    return { token, claims };
  }

  async verify(token: string, expectedOrganizationId: string): Promise<VoiceMcpTokenClaims> {
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, resolveVoiceMcpTokenSecret(), {
        issuer: 'synqdrive-voice-mcp',
      }) as jwt.JwtPayload;
    } catch {
      throw new VoiceMcpError('InvalidToken', 'The MCP access token is invalid or expired.');
    }

    if (decoded.typ !== VOICE_MCP_TOKEN_TYPE) {
      throw new VoiceMcpError('InvalidToken', 'The MCP access token type is not supported.');
    }

    const organizationId = String(decoded.org ?? '');
    if (!organizationId || organizationId !== expectedOrganizationId) {
      throw new VoiceMcpError('TenantMismatch', 'The MCP token does not match the requested organization.');
    }

    const nonce = String(decoded.jti ?? '');
    if (!nonce) {
      throw new VoiceMcpError('InvalidToken', 'The MCP access token is missing replay protection metadata.');
    }

    const conversationId = String(decoded.cid ?? decoded.sub ?? '');
    if (conversationId && (await this.nonceStore.isConversationRevoked(conversationId))) {
      throw new VoiceMcpError('InvalidToken', 'The MCP access token has been revoked.');
    }

    const nonceKnown = await this.nonceStore.assertIssuedNonce(nonce);
    if (!nonceKnown) {
      throw new VoiceMcpError('InvalidToken', 'The MCP access token has been revoked or was never issued.');
    }

    const allowedTools = Array.isArray(decoded.tools)
      ? decoded.tools.map((tool) => String(tool))
      : [];

    return {
      organizationId,
      voiceAssistantId: String(decoded.vai ?? ''),
      agentDeploymentId: String(decoded.adp ?? ''),
      conversationId: String(decoded.cid ?? decoded.sub ?? ''),
      allowedTools: allowedTools as VoiceMcpTokenClaims['allowedTools'],
      scopes: Array.isArray(decoded.scopes) ? decoded.scopes.map((scope) => String(scope)) : [],
      issuedAt: Number(decoded.iat ?? 0),
      expiresAt: Number(decoded.exp ?? 0),
      nonce,
      audience: decoded.aud ? String(decoded.aud) : null,
    };
  }
}
