import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

@Injectable()
export class FleetMapCacheService {
  private readonly logger = new Logger(FleetMapCacheService.name);

  constructor(private readonly redis: RedisService) {}

  cacheKey(organizationId: string): string {
    return `fleet-map:${organizationId}:v1`;
  }

  async invalidate(organizationId: string): Promise<void> {
    if (!organizationId) return;
    try {
      await this.redis.del(this.cacheKey(organizationId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Fleet-map cache invalidate failed (${message})`);
    }
  }
}
