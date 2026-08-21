import { SmsMessageDeliveryStatus } from '@prisma/client';

const STATUS_RANK: Record<SmsMessageDeliveryStatus, number> = {
  [SmsMessageDeliveryStatus.PENDING]: 0,
  [SmsMessageDeliveryStatus.DISPATCHING]: 1,
  [SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS]: 1,
  [SmsMessageDeliveryStatus.QUEUED]: 2,
  [SmsMessageDeliveryStatus.SENT]: 3,
  [SmsMessageDeliveryStatus.DELIVERED]: 4,
  [SmsMessageDeliveryStatus.FAILED]: 10,
  [SmsMessageDeliveryStatus.BLOCKED]: 10,
};

const TERMINAL_STATUSES = new Set<SmsMessageDeliveryStatus>([
  SmsMessageDeliveryStatus.FAILED,
  SmsMessageDeliveryStatus.BLOCKED,
  SmsMessageDeliveryStatus.DELIVERED,
]);

export function mapSentDmLifecycleToNativeStatus(providerStatus: string): SmsMessageDeliveryStatus | null {
  switch (providerStatus.trim().toUpperCase()) {
    case 'QUEUED':
      return SmsMessageDeliveryStatus.QUEUED;
    case 'SENT':
      return SmsMessageDeliveryStatus.SENT;
    case 'DELIVERED':
      return SmsMessageDeliveryStatus.DELIVERED;
    case 'FAILED':
    case 'REJECTED':
    case 'UNDELIVERABLE':
      return SmsMessageDeliveryStatus.FAILED;
    case 'BLOCKED':
      return SmsMessageDeliveryStatus.BLOCKED;
    default:
      return null;
  }
}

export function shouldApplyNativeDeliveryTransition(
  current: SmsMessageDeliveryStatus,
  next: SmsMessageDeliveryStatus,
): boolean {
  if (TERMINAL_STATUSES.has(current)) {
    return false;
  }
  return STATUS_RANK[next] > STATUS_RANK[current];
}
