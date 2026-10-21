import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import type { M3_3HvH4A3FleetCursorV1 } from './m3-3-hv-h4-a3-reconciliation.types.v1';

export const M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY =
  'battery:hv:h4:a3:reconciliation:cursor:v1';

export type M3_3HvH4A3CursorLoadResultV1 =
  | { status: 'ABSENT' }
  | { status: 'OK'; cursor: M3_3HvH4A3FleetCursorV1 }
  | { status: 'MALFORMED' }
  | { status: 'UNAVAILABLE' };

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function parseCursorPayload(raw: string): M3_3HvH4A3FleetCursorV1 | 'MALFORMED' {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      isUuid(parsed.organizationId) &&
      isUuid(parsed.vehicleId) &&
      isUuid(parsed.id)
    ) {
      return {
        organizationId: parsed.organizationId,
        vehicleId: parsed.vehicleId,
        id: parsed.id,
      };
    }
    return 'MALFORMED';
  } catch {
    return 'MALFORMED';
  }
}

@Injectable()
export class M3_3HvH4A3ReconciliationCursorStore {
  private readonly logger = new Logger(M3_3HvH4A3ReconciliationCursorStore.name);

  constructor(private readonly redis: RedisService) {}

  async load(): Promise<M3_3HvH4A3CursorLoadResultV1> {
    try {
      const raw = await this.redis.get(M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY);
      if (raw == null || raw === '') return { status: 'ABSENT' };
      const parsed = parseCursorPayload(raw);
      if (parsed === 'MALFORMED') {
        this.logger.warn('hv_h4_a3_reconciliation_cursor_malformed resetting');
        return { status: 'MALFORMED' };
      }
      return { status: 'OK', cursor: parsed };
    } catch (err) {
      this.logger.warn(
        `hv_h4_a3_reconciliation_cursor_load_unavailable: ${err instanceof Error ? err.message : err}`,
      );
      return { status: 'UNAVAILABLE' };
    }
  }

  async save(cursor: M3_3HvH4A3FleetCursorV1): Promise<boolean> {
    try {
      await this.redis.set(
        M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY,
        JSON.stringify(cursor),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `hv_h4_a3_reconciliation_cursor_save_failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.del(M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY);
    } catch {
      // operational — loss is safe
    }
  }
}
