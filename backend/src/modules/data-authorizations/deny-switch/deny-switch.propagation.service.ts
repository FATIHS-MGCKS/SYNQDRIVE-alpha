import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { hostname } from 'os';
import redisConfig from '@config/redis.config';
import { DENY_SWITCH } from './deny-switch.constants';
import { DenySwitchLocalStore } from './deny-switch.local-store';
import { DenySwitchMetricsService } from './deny-switch.metrics';
import type { DenySwitchPropagationMessage } from './deny-switch.types';
import { rowToLocalEntry } from './deny-switch.evaluator';

@Injectable()
export class DenySwitchPropagationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DenySwitchPropagationService.name);
  private subscriber: Redis | null = null;
  private readonly instanceId = `${hostname()}:${process.pid}`;

  constructor(
    private readonly localStore: DenySwitchLocalStore,
    private readonly metrics: DenySwitchMetricsService,
    @Inject(redisConfig.KEY) private readonly redisConf: ConfigType<typeof redisConfig>,
  ) {}

  onModuleInit(): void {
    if (process.env.DATA_AUTH_DENY_SWITCH_PUBSUB_ENABLED === 'false') return;
    try {
      this.subscriber = new Redis({
        host: this.redisConf.host,
        port: this.redisConf.port,
        password: this.redisConf.password,
        db: this.redisConf.db,
        maxRetriesPerRequest: null,
      });
      void this.subscriber.subscribe(DENY_SWITCH.redisChannel);
      this.subscriber.on('message', (_channel, payload) => {
        try {
          const message = JSON.parse(payload) as DenySwitchPropagationMessage;
          this.applyMessage(message);
        } catch (err) {
          this.logger.error(
            `Deny-switch propagation parse failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
      this.subscriber.on('error', (err) => {
        this.metrics.increment({ outcome: 'redis_subscribe_error' });
        this.logger.error(`Deny-switch subscriber error: ${err.message}`);
      });
      this.logger.log(`Deny-switch Redis subscriber active on ${DENY_SWITCH.redisChannel}`);
    } catch (err) {
      this.metrics.increment({ outcome: 'redis_subscribe_error' });
      this.logger.error(
        `Deny-switch subscriber init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  async publish(
    publisher: Redis,
    message: Omit<DenySwitchPropagationMessage, 'publishedAt' | 'instanceId'>,
  ): Promise<boolean> {
    const envelope: DenySwitchPropagationMessage = {
      ...message,
      publishedAt: new Date().toISOString(),
      instanceId: this.instanceId,
    };
    try {
      await publisher.publish(DENY_SWITCH.redisChannel, JSON.stringify(envelope));
      return true;
    } catch (err) {
      this.metrics.increment({ outcome: 'redis_publish_failed', scopeType: message.scopeType });
      this.logger.error(
        `Deny-switch publish failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  applyMessage(message: DenySwitchPropagationMessage): boolean {
    const activatedAtMs = Date.parse(message.activatedAt);
    const publishedAtMs = Date.parse(message.publishedAt);
    if (Number.isFinite(activatedAtMs) && Number.isFinite(publishedAtMs)) {
      this.metrics.recordPropagationLatency(Math.max(0, publishedAtMs - activatedAtMs));
    }

    const entry = rowToLocalEntry({
      organizationId: message.organizationId,
      scopeType: message.scopeType,
      scopeEntityId: message.scopeEntityId,
      resourceType: message.resourceType,
      resourceId: message.resourceId,
      sequence: BigInt(message.sequence),
      active: message.active,
      blocksIngest: message.blocksIngest,
      blocksRead: message.blocksRead,
      blocksQueueEnqueue: message.blocksQueueEnqueue,
      trigger: message.trigger,
      activatedAt: new Date(message.activatedAt),
    });

    const applied = this.localStore.apply(entry, { allowDeactivate: !message.active });
    if (!applied) {
      this.metrics.increment({ outcome: 'propagation_stale', scopeType: message.scopeType });
      return false;
    }
    this.metrics.increment({ outcome: 'propagation_received', scopeType: message.scopeType });
    return true;
  }
}
