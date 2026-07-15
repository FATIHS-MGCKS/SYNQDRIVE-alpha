import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import {
  fleetOperationalCacheKeysForVehicles,
  uniqueNonEmptyVehicleIds,
} from './fleet-operational-read-model-cache.keys';

export interface FleetOperationalCacheInvalidationInput {
  organizationId: string;
  vehicleIds: Array<string | null | undefined>;
}

/**
 * Targeted invalidation for fleet operational read models (fleet-map + per-vehicle detail).
 * Callers must invoke only after the owning transaction has committed successfully.
 */
@Injectable()
export class FleetOperationalReadModelCacheService {
  private readonly logger = new Logger(FleetOperationalReadModelCacheService.name);

  constructor(private readonly redis: RedisService) {}

  async invalidateVehicles(
    input: FleetOperationalCacheInvalidationInput,
  ): Promise<void> {
    const organizationId = input.organizationId?.trim();
    if (!organizationId) return;

    const vehicleIds = uniqueNonEmptyVehicleIds(input.vehicleIds);
    const keys = fleetOperationalCacheKeysForVehicles(organizationId, vehicleIds);
    await this.deleteKeys(keys);
  }

  private async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Fleet operational cache invalidation failed (${message})`);
    }
  }
}
