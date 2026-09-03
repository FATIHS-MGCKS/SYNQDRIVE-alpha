import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

/** Covers assess retry backoff + lock duration with crash-recovery margin. */
export const BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS = 30 * 60_000;

const RELEASE_IF_MATCH_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * O(1) vehicle-scoped assess dispatch authority.
 * Independent of BullMQ queue depth — replaces bounded queue scans.
 */
@Injectable()
export class BatteryV2AssessDispatchReservationService {
  private readonly logger = new Logger(BatteryV2AssessDispatchReservationService.name);

  constructor(private readonly redis: RedisService) {}

  reservationKey(vehicleId: string): string {
    return `battery:v2:assess-dispatch:${vehicleId}`;
  }

  async tryReserve(
    vehicleId: string,
    idempotencyKey: string,
    ttlMs = BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS,
  ): Promise<boolean> {
    try {
      const result = await this.redis.set(
        this.reservationKey(vehicleId),
        idempotencyKey,
        'PX',
        ttlMs,
        'NX',
      );
      return result === 'OK';
    } catch (err) {
      this.logger.warn(
        `Assess dispatch reserve failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async refresh(
    vehicleId: string,
    idempotencyKey: string,
    ttlMs = BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS,
  ): Promise<void> {
    try {
      const key = this.reservationKey(vehicleId);
      const current = await this.redis.get(key);
      if (current === idempotencyKey) {
        await this.redis.pexpire(key, ttlMs);
      }
    } catch (err) {
      this.logger.warn(
        `Assess dispatch refresh failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
    }
  }

  async release(vehicleId: string, idempotencyKey: string): Promise<void> {
    try {
      await this.redis.eval(
        RELEASE_IF_MATCH_SCRIPT,
        1,
        this.reservationKey(vehicleId),
        idempotencyKey,
      );
    } catch (err) {
      this.logger.warn(
        `Assess dispatch release failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
    }
  }

  async getReservedIdempotencyKey(vehicleId: string): Promise<string | null> {
    try {
      return await this.redis.get(this.reservationKey(vehicleId));
    } catch {
      return null;
    }
  }

  /**
   * True when another assess job idempotency key holds the vehicle reservation.
   */
  async hasConflictingReservation(
    vehicleId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const reserved = await this.getReservedIdempotencyKey(vehicleId);
    if (!reserved) return false;
    return reserved !== idempotencyKey;
  }

  /** True when any assess dispatch reservation exists for the vehicle. */
  async hasReservationForVehicle(vehicleId: string): Promise<boolean> {
    const reserved = await this.getReservedIdempotencyKey(vehicleId);
    return reserved != null;
  }
}
