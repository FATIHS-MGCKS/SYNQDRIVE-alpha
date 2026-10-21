import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import {
  ASSESS_DISPATCH_RESERVATION_READ_STATUS,
  ASSESS_DISPATCH_RESERVATION_STATUS,
  type AssessDispatchReservationAcquireResult,
  type AssessDispatchReservationReadResult,
} from './battery-v2-assess-dispatch-reservation.types';

/** Covers assess retry backoff + lock duration with crash-recovery margin. */
export const BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS = 30 * 60_000;

const RELEASE_IF_MATCH_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const REFRESH_IF_MATCH_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

/**
 * O(1) vehicle-scoped assess dispatch authority.
 * Independent of BullMQ queue depth — replaces bounded queue scans.
 *
 * Redis errors are AUTHORITY_UNAVAILABLE — never interpreted as absent reservation.
 */
@Injectable()
export class BatteryV2AssessDispatchReservationService {
  private readonly logger = new Logger(BatteryV2AssessDispatchReservationService.name);

  constructor(private readonly redis: RedisService) {}

  reservationKey(vehicleId: string): string {
    return `battery:v2:assess-dispatch:${vehicleId}`;
  }

  async readReservation(vehicleId: string): Promise<AssessDispatchReservationReadResult> {
    try {
      const value = await this.redis.get(this.reservationKey(vehicleId));
      if (value == null) {
        return { status: ASSESS_DISPATCH_RESERVATION_READ_STATUS.ABSENT };
      }
      return {
        status: ASSESS_DISPATCH_RESERVATION_READ_STATUS.HELD,
        idempotencyKey: value,
      };
    } catch (err) {
      return {
        status: ASSESS_DISPATCH_RESERVATION_READ_STATUS.AUTHORITY_UNAVAILABLE,
        cause: err as Error,
      };
    }
  }

  async acquireForDispatch(
    vehicleId: string,
    idempotencyKey: string,
    ttlMs = BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS,
  ): Promise<AssessDispatchReservationAcquireResult> {
    try {
      const result = await this.redis.set(
        this.reservationKey(vehicleId),
        idempotencyKey,
        'PX',
        ttlMs,
        'NX',
      );
      if (result === 'OK') {
        return { status: ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED };
      }

      const read = await this.readReservation(vehicleId);
      if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.AUTHORITY_UNAVAILABLE) {
        return {
          status: ASSESS_DISPATCH_RESERVATION_STATUS.AUTHORITY_UNAVAILABLE,
          cause: read.cause,
        };
      }
      if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.ABSENT) {
        return { status: ASSESS_DISPATCH_RESERVATION_STATUS.ACQUIRED };
      }
      if (read.idempotencyKey === idempotencyKey) {
        return { status: ASSESS_DISPATCH_RESERVATION_STATUS.SAME_IDENTITY_HELD };
      }
      return { status: ASSESS_DISPATCH_RESERVATION_STATUS.CONFLICT };
    } catch (err) {
      this.logger.warn(
        `Assess dispatch acquire failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
      return {
        status: ASSESS_DISPATCH_RESERVATION_STATUS.AUTHORITY_UNAVAILABLE,
        cause: err as Error,
      };
    }
  }

  /**
   * Atomic compare-and-expire — stale processors cannot extend a replacement reservation.
   */
  async refresh(
    vehicleId: string,
    idempotencyKey: string,
    ttlMs = BATTERY_V2_ASSESS_DISPATCH_RESERVATION_TTL_MS,
  ): Promise<boolean> {
    try {
      const refreshed = await this.redis.eval(
        REFRESH_IF_MATCH_SCRIPT,
        1,
        this.reservationKey(vehicleId),
        idempotencyKey,
        String(ttlMs),
      );
      return Number(refreshed) === 1;
    } catch (err) {
      this.logger.warn(
        `Assess dispatch refresh failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async release(vehicleId: string, idempotencyKey: string): Promise<boolean> {
    try {
      const released = await this.redis.eval(
        RELEASE_IF_MATCH_SCRIPT,
        1,
        this.reservationKey(vehicleId),
        idempotencyKey,
      );
      return Number(released) === 1;
    } catch (err) {
      this.logger.warn(
        `Assess dispatch release failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async getReservedIdempotencyKey(vehicleId: string): Promise<string | null> {
    const read = await this.readReservation(vehicleId);
    if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.HELD) {
      return read.idempotencyKey;
    }
    return null;
  }

  /**
   * Fail-closed: AUTHORITY_UNAVAILABLE blocks dispatch (treated as conflict).
   */
  async hasConflictingReservation(
    vehicleId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const read = await this.readReservation(vehicleId);
    if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.AUTHORITY_UNAVAILABLE) {
      return true;
    }
    if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.ABSENT) {
      return false;
    }
    return read.idempotencyKey !== idempotencyKey;
  }

  /** Fail-closed: AUTHORITY_UNAVAILABLE treated as reservation present. */
  async hasReservationForVehicle(vehicleId: string): Promise<boolean> {
    const read = await this.readReservation(vehicleId);
    if (read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.AUTHORITY_UNAVAILABLE) {
      return true;
    }
    return read.status === ASSESS_DISPATCH_RESERVATION_READ_STATUS.HELD;
  }
}
