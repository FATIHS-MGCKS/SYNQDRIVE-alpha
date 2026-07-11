import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Feature flag for Notification Engine V2 (shadow mode).
 * When false: core engine is a no-op for writes; legacy dashboard paths unchanged.
 */
@Injectable()
export class NotificationEngineConfig {
  constructor(private readonly config: ConfigService) {}

  isV2Enabled(): boolean {
    return this.config.get<string>('NOTIFICATIONS_V2', 'false') === 'true';
  }
}
