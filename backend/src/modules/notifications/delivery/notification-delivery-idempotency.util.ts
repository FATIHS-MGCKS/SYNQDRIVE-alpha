import type { NotificationDeliveryChannel, NotificationDeliveryTransition } from '@prisma/client';

export function buildDeliveryIdempotencyKey(input: {
  notificationId: string;
  lifecycleGeneration: number;
  deliveryTransition: NotificationDeliveryTransition;
  channel: NotificationDeliveryChannel;
  recipientId: string;
}): string {
  return [
    input.notificationId,
    input.lifecycleGeneration,
    input.deliveryTransition,
    input.channel,
    input.recipientId,
  ].join(':');
}
