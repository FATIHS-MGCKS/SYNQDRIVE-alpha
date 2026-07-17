import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { resolveVoiceMcpRateLimitPerMinute } from './voice-mcp-gateway.config';
import { VoiceMcpError } from './voice-mcp-errors';

const RATE_PREFIX = 'voice:mcp:rate:';

@Injectable()
export class VoiceMcpRateLimitService {
  constructor(private readonly redis: RedisService) {}

  async assertWithinLimit(organizationId: string): Promise<void> {
    const limit = resolveVoiceMcpRateLimitPerMinute();
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `${RATE_PREFIX}${organizationId}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 70);
    }
    if (count > limit) {
      throw new VoiceMcpError('RateLimited', 'Too many MCP requests for this organization. Please retry shortly.');
    }
  }
}
