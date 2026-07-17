import { VoiceMcpRateLimitService } from './voice-mcp-rate-limit.service';
import { RedisService } from '@shared/redis/redis.service';
import { VoiceMcpError } from './voice-mcp-errors';

describe('VoiceMcpRateLimitService', () => {
  it('blocks requests above the per-minute org limit', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(121),
      expire: jest.fn(),
    } as unknown as RedisService;

    const service = new VoiceMcpRateLimitService(redis);
    process.env.VOICE_MCP_RATE_LIMIT_PER_MINUTE = '120';

    await expect(service.assertWithinLimit('org-1')).rejects.toBeInstanceOf(VoiceMcpError);
  });
});
