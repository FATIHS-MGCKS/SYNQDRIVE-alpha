import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

const ISSUED_PREFIX = 'voice:mcp:issued:';
const REQUEST_PREFIX = 'voice:mcp:req:';

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

  async assertFreshRequestId(requestId: string, ttlSeconds = 300): Promise<boolean> {
    const key = `${REQUEST_PREFIX}${requestId}`;
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
