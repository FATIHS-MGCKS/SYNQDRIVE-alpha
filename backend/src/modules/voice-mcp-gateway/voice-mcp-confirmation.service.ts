import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '@shared/redis/redis.service';
import { VOICE_MCP_CONFIRMATION_TTL_SECONDS } from './voice-mcp-gateway.constants';
import { VoiceMcpError } from './voice-mcp-errors';
import type { VoiceMcpRequestContext } from './voice-mcp-context.types';
import { stableParameterHash, stripConfirmationFields } from './voice-mcp-parameter-hash.util';
import { getVoiceMcpToolDefinition } from './voice-mcp-tools.registry';

const CONFIRM_PREFIX = 'voice:mcp:confirm:';

type StoredConfirmation = {
  organizationId: string;
  conversationId: string;
  toolName: string;
  parameterHash: string;
  actionSummary: string;
  expiresAt: string;
};

@Injectable()
export class VoiceMcpConfirmationService {
  constructor(private readonly redis: RedisService) {}

  async createProposal(
    context: VoiceMcpRequestContext,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    const parameterHash = stableParameterHash(args);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + VOICE_MCP_CONFIRMATION_TTL_SECONDS * 1000).toISOString();
    const actionSummary = this.buildActionSummary(toolName, args);

    const payload: StoredConfirmation = {
      organizationId: context.organizationId,
      conversationId: context.conversationId,
      toolName,
      parameterHash,
      actionSummary,
      expiresAt,
    };

    await this.redis.set(
      `${CONFIRM_PREFIX}${token}`,
      JSON.stringify(payload),
      'EX',
      VOICE_MCP_CONFIRMATION_TTL_SECONDS,
      'NX',
    );

    return { confirmationToken: token, parameterHash, actionSummary, expiresAt };
  }

  async consume(
    context: VoiceMcpRequestContext,
    toolName: string,
    args: Record<string, unknown>,
    confirmationToken: string,
  ): Promise<void> {
    const key = `${CONFIRM_PREFIX}${confirmationToken}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new VoiceMcpError('ConfirmationInvalid', 'The confirmation token is invalid or was already used.');
    }

    const stored = JSON.parse(raw) as StoredConfirmation;
    if (stored.organizationId !== context.organizationId) {
      throw new VoiceMcpError('TenantMismatch', 'The confirmation token does not belong to this organization.');
    }
    if (stored.conversationId !== context.conversationId) {
      throw new VoiceMcpError('ConfirmationInvalid', 'The confirmation token does not match this conversation.');
    }
    if (stored.toolName !== toolName) {
      throw new VoiceMcpError('ConfirmationInvalid', 'The confirmation token does not match this tool.');
    }

    const parameterHash = stableParameterHash(stripConfirmationFields(args));
    if (stored.parameterHash !== parameterHash) {
      throw new VoiceMcpError('ConfirmationInvalid', 'The confirmed parameters do not match the proposed action.');
    }

    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      await this.redis.del(key);
      throw new VoiceMcpError('ConfirmationExpired', 'The confirmation token has expired.');
    }

    const deleted = await this.redis.del(key);
    if (deleted !== 1) {
      throw new VoiceMcpError('ConfirmationInvalid', 'The confirmation token is no longer valid.');
    }
  }

  summarizeAction(toolName: string, args: Record<string, unknown>): string {
    return this.buildActionSummary(toolName, stripConfirmationFields(args));
  }

  private buildActionSummary(toolName: string, args: Record<string, unknown>): string {
    const definition = getVoiceMcpToolDefinition(toolName);
    const label = definition?.description ?? toolName;
    const keys = Object.keys(args).filter((key) => key !== 'confirmationToken');
    const details = keys
      .slice(0, 4)
      .map((key) => `${key}: ${String(args[key]).slice(0, 80)}`)
      .join('; ');
    return details ? `${label} — ${details}` : label;
  }
}
