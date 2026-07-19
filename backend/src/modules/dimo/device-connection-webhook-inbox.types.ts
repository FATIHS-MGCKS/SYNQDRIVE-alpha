import { createHash } from 'crypto';
import {
  DeviceConnectionWebhookProcessingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { DEVICE_CONNECTION_DEDUP_WINDOW_MS } from './device-connection-webhook.service';

export type DeviceConnectionWebhookIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'ignored_by_policy'
  | 'retryable_failed'
  | 'permanently_failed'
  | 'already_processed';

export const TERMINAL_INBOX_STATUSES: ReadonlySet<DeviceConnectionWebhookProcessingStatus> =
  new Set([
    DeviceConnectionWebhookProcessingStatus.PROCESSED,
    DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY,
    DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED,
    DeviceConnectionWebhookProcessingStatus.DEAD_LETTER,
  ]);

export function computeWebhookPayloadHash(rawPayload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(rawPayload ?? null))
    .digest('hex');
}

export function computeProviderEventId(input: {
  provider: string;
  tokenId: number;
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
}): string {
  const dedupBucket = BigInt(
    Math.floor(input.observedAt.getTime() / DEVICE_CONNECTION_DEDUP_WINDOW_MS),
  );
  return `${input.provider}:token:${input.tokenId}:type:${input.eventType}:bucket:${dedupBucket}`;
}

export function isTerminalInboxStatus(
  status: DeviceConnectionWebhookProcessingStatus,
): boolean {
  return TERMINAL_INBOX_STATUSES.has(status);
}
