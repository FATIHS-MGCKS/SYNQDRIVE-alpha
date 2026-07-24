import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

const ISSUED_PREFIX = 'voice:mcp:issued:';
const REQUEST_PREFIX = 'voice:mcp:req:';
const REVOKED_CONV_PREFIX = 'voice:mcp:revoked:conv:';

@Injectable()
export class VoiceMcpNonceStore {
  constructor(private readonly redis: RedisService) {}

  async registerIssuedNonce(nonce: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${ISSUED_PREFIX}${nonce}`, '1', 'EX', ttlSeconds);
  }

  async assertIssuedNonce(nonce: string): Promise<boolean> {
    const value = await this.redis.get(`${ISSUED_PREFIX}${nonce}`);
    return value === '1';
  }

  async revokeNonce(nonce: string): Promise<void> {
    await this.redis.del(`${ISSUED_PREFIX}${nonce}`);
  }

  async revokeConversation(conversationId: string, ttlSeconds = 86_400): Promise<void> {
    await this.redis.set(`${REVOKED_CONV_PREFIX}${conversationId}`, '1', 'EX', ttlSeconds);
  }

  async isConversationRevoked(conversationId: string): Promise<boolean> {
    const value = await this.redis.get(`${REVOKED_CONV_PREFIX}${conversationId}`);
    return value === '1';
  }

  async revokeConversationTokens(conversationId: string): Promise<number> {
    await this.revokeConversation(conversationId);
    return 1;
  }

  async assertFreshRequestId(requestId: string, ttlSeconds = 300): Promise<boolean> {
    const key = `${REQUEST_PREFIX}${requestId}`;
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
