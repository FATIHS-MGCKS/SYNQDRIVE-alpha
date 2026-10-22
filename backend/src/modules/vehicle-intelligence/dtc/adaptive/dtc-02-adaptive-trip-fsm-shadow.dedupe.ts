import type { RedisService } from '@shared/redis/redis.service';
import { DTC02_TRIP_POLL_COALESCE_MS } from './dtc-02-adaptive-planner.constants';

const memoryDedupeUntilMs = new Map<string, number>();

export function buildDtc02TripFsmShadowDedupeKey(input: {
  vehicleId: string;
  tripId: string;
  eventKind: 'trip_start_confirmed' | 'trip_end_finalized';
}): string {
  return `dtc02:adaptive-shadow:trip-fsm:${input.vehicleId}:${input.eventKind}:${input.tripId}`;
}

/**
 * Cross-replica shadow dedupe — one shadow plan per trip boundary event.
 * Falls back to process memory when Redis is unavailable (unit tests).
 */
export async function tryAcquireDtc02TripFsmShadowDedupe(input: {
  redis?: RedisService | null;
  dedupeKey: string;
  ttlMs?: number;
}): Promise<boolean> {
  const ttlMs = input.ttlMs ?? DTC02_TRIP_POLL_COALESCE_MS;
  if (input.redis) {
    try {
      const result = await input.redis.set(input.dedupeKey, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }
  const now = Date.now();
  const until = memoryDedupeUntilMs.get(input.dedupeKey);
  if (until != null && until > now) {
    return false;
  }
  memoryDedupeUntilMs.set(input.dedupeKey, now + ttlMs);
  return true;
}
