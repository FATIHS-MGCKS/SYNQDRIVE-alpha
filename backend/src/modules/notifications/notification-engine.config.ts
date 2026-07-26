import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isNotificationV2EnabledForOrg } from './notification-rollout.util';

/**
 * Feature flag for Notification Engine V2 (shadow mode).
 * When false: core engine is a no-op for writes; legacy dashboard paths unchanged.
 *
 * Optional `NOTIFICATIONS_V2_ORG_ALLOWLIST` (comma-separated org UUIDs) limits V2
 * to pilot orgs while global NOTIFICATIONS_V2=true.
 */
@Injectable()
export class NotificationEngineConfig {
  constructor(private readonly config: ConfigService) {}

  isV2Enabled(): boolean {
    return this.config.get<string>('NOTIFICATIONS_V2', 'false') === 'true';
  }

  isV2EnabledForOrg(organizationId: string | null | undefined): boolean {
    return isNotificationV2EnabledForOrg(this.isV2Enabled(), organizationId, process.env);
  }
}
