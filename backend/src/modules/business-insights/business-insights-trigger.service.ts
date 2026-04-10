import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { BusinessInsightsService } from './business-insights.service';

const DEBOUNCE_KEY_PREFIX = 'bi:debounce:';
const DEBOUNCE_WINDOW_MS = 2 * 60_000;
const PENDING_KEY_PREFIX = 'bi:pending:';

@Injectable()
export class BusinessInsightsTriggerService {
  private readonly logger = new Logger(BusinessInsightsTriggerService.name);
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redis: RedisService,
    private readonly insightsService: BusinessInsightsService,
  ) {}

  async onBookingChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_booking_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async onVehicleChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_vehicle_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async onStationChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_station_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async requestDebouncedRerun(organizationId: string, eventSource: string) {
    const debounceKey = `${DEBOUNCE_KEY_PREFIX}${organizationId}`;
    const pendingKey = `${PENDING_KEY_PREFIX}${organizationId}`;

    try {
      const existing = await this.redis.get(debounceKey);
      if (existing) {
        this.logger.debug(`Debounce active for org ${organizationId}, coalescing event: ${eventSource}`);
        await this.redis.rpush(pendingKey, eventSource);
        return;
      }

      await this.redis.set(debounceKey, '1', 'PX', DEBOUNCE_WINDOW_MS);
      await this.redis.rpush(pendingKey, eventSource);

      this.scheduleExecution(organizationId);
    } catch (err) {
      this.logger.error(`Failed to debounce rerun for org ${organizationId}: ${err}`);
    }
  }

  private scheduleExecution(organizationId: string) {
    if (this.pendingTimers.has(organizationId)) return;

    const timer = setTimeout(async () => {
      this.pendingTimers.delete(organizationId);
      await this.executeRerun(organizationId);
    }, DEBOUNCE_WINDOW_MS);

    this.pendingTimers.set(organizationId, timer);
  }

  private async executeRerun(organizationId: string) {
    const pendingKey = `${PENDING_KEY_PREFIX}${organizationId}`;
    const debounceKey = `${DEBOUNCE_KEY_PREFIX}${organizationId}`;

    try {
      const events = await this.redis.lrange(pendingKey, 0, -1);
      await this.redis.del(pendingKey, debounceKey);

      const uniqueEvents = [...new Set(events)];
      const trigger = `debounced_event(${uniqueEvents.slice(0, 3).join(',')})`;

      this.logger.log(
        `Executing debounced rerun for org ${organizationId}: ${events.length} events coalesced → ${uniqueEvents.length} unique`,
      );

      await this.insightsService.runForOrganization(organizationId, trigger);
    } catch (err) {
      this.logger.error(`Debounced rerun failed for org ${organizationId}: ${err}`);
      await this.redis.del(pendingKey, debounceKey).catch(() => {});
    }
  }
}
