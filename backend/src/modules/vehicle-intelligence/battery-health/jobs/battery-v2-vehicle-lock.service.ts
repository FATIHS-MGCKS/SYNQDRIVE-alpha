import { Injectable, Logger } from '@nestjs/common';
import {
  RedisDistributedLockService,
  type DistributedLockHandle,
} from '@shared/redis/redis-distributed-lock.service';

export type BatteryV2VehicleLockScope = 'ingest' | 'assess' | 'publish' | 'hv';

const DEFAULT_LOCK_TTL_MS = 120_000;

export class BatteryV2VehicleLockContendedError extends Error {
  constructor(
    readonly vehicleId: string,
    readonly scope: BatteryV2VehicleLockScope,
  ) {
    super(`Battery V2 vehicle lock contended: vehicle=${vehicleId} scope=${scope}`);
    this.name = 'BatteryV2VehicleLockContendedError';
  }
}

@Injectable()
export class BatteryV2VehicleLockService {
  private readonly logger = new Logger(BatteryV2VehicleLockService.name);

  constructor(private readonly lockService: RedisDistributedLockService) {}

  lockKey(vehicleId: string, scope: BatteryV2VehicleLockScope): string {
    return `battery:v2:lock:${scope}:${vehicleId}`;
  }

  scopeForJobType(jobType: string): BatteryV2VehicleLockScope {
    switch (jobType) {
      case 'BATTERY_ASSESSMENT_RECOMPUTE':
        return 'assess';
      case 'BATTERY_PUBLICATION_UPDATE':
        return 'publish';
      case 'HV_RECHARGE_SESSION_RECONCILE':
      case 'HV_CAPACITY_SHADOW_RECOMPUTE':
      case 'HV_CAPABILITY_REFRESH':
        return 'hv';
      default:
        return 'ingest';
    }
  }

  async acquire(
    vehicleId: string,
    scope: BatteryV2VehicleLockScope,
    ttlMs = DEFAULT_LOCK_TTL_MS,
  ): Promise<DistributedLockHandle> {
    const key = this.lockKey(vehicleId, scope);
    const result = await this.lockService.acquire(key, ttlMs);
    if (!result.acquired) {
      if (result.reason === 'contended') {
        throw new BatteryV2VehicleLockContendedError(vehicleId, scope);
      }
      this.logger.warn(
        `Battery V2 lock redis unavailable for vehicle=${vehicleId} scope=${scope} — proceeding without lock`,
      );
      return { key, token: 'redis-unavailable', acquiredAt: new Date() };
    }
    return result.handle;
  }

  async release(handle: DistributedLockHandle): Promise<void> {
    if (handle.token === 'redis-unavailable') return;
    await this.lockService.release(handle);
  }
}
