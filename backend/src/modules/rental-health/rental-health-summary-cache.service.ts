import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import type { VehicleHealth } from './rental-health.types';
import {
  RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION,
  RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS,
  type RentalHealthSummaryCacheEnvelope,
} from './rental-health-summary.types';

@Injectable()
export class RentalHealthSummaryCacheService {
  private readonly logger = new Logger(RentalHealthSummaryCacheService.name);

  constructor(private readonly redis: RedisService) {}

  cacheKey(organizationId: string, vehicleId: string): string {
    return `rental-health-summary:${organizationId}:${vehicleId}:${RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION}`;
  }

  async get(
    organizationId: string,
    vehicleId: string,
  ): Promise<RentalHealthSummaryCacheEnvelope | null> {
    if (!organizationId || !vehicleId) return null;
    try {
      const raw = await this.redis.get(this.cacheKey(organizationId, vehicleId));
      if (!raw) return null;
      return JSON.parse(raw) as RentalHealthSummaryCacheEnvelope;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Rental-health summary cache read failed (${message})`);
      return null;
    }
  }

  async set(
    organizationId: string,
    vehicleId: string,
    health: VehicleHealth,
  ): Promise<void> {
    if (!organizationId || !vehicleId) return;
    const envelope: RentalHealthSummaryCacheEnvelope = {
      health,
      cached_at: new Date().toISOString(),
    };
    try {
      await this.redis.set(
        this.cacheKey(organizationId, vehicleId),
        JSON.stringify(envelope),
        'EX',
        RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Rental-health summary cache write failed (${message})`);
    }
  }

  async invalidate(organizationId: string, vehicleId: string): Promise<void> {
    if (!organizationId || !vehicleId) return;
    try {
      await this.redis.del(this.cacheKey(organizationId, vehicleId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Rental-health summary cache invalidate failed (${message})`);
    }
  }
}
