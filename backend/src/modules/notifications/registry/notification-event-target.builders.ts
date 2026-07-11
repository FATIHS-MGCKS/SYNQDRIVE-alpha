import { NotificationActionType, NotificationEntityType } from '../notification.enums';
import type { NotificationActionTarget } from '../notification.types';
import type { NotificationActionTargetContext } from './notification-event-registry.types';

export function vehicleTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_VEHICLE,
    vehicleId: ctx.vehicleId ?? ctx.entityId,
  };
}

export function vehicleModuleTarget(
  module: string,
): (ctx: NotificationActionTargetContext) => NotificationActionTarget {
  return (ctx) => ({
    type: NotificationActionType.OPEN_VEHICLE_MODULE,
    vehicleId: ctx.vehicleId ?? ctx.entityId,
    module,
  });
}

export function bookingTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_BOOKING,
    bookingId: ctx.bookingId ?? ctx.entityId,
  };
}

export function handoverPickupTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_HANDOVER_PICKUP,
    bookingId: ctx.bookingId ?? ctx.entityId,
  };
}

export function handoverReturnTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_HANDOVER_RETURN,
    bookingId: ctx.bookingId ?? ctx.entityId,
  };
}

export function stationTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_STATION,
    stationId: ctx.stationId ?? ctx.entityId,
  };
}

export function billingTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_BILLING,
    invoiceId: ctx.invoiceId ?? ctx.entityId,
  };
}

export function tripTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_VEHICLE_MODULE,
    vehicleId: ctx.vehicleId,
    tripId: ctx.tripId ?? ctx.entityId,
    module: 'trips',
  };
}

export function rentalTarget(ctx: NotificationActionTargetContext): NotificationActionTarget {
  return {
    type: NotificationActionType.OPEN_RENTAL,
    bookingId: ctx.bookingId,
    vehicleId: ctx.vehicleId,
  };
}

export function resolveEntityType(
  ctx: NotificationActionTargetContext,
  expected: NotificationEntityType,
): NotificationActionTargetContext {
  return { ...ctx, entityType: expected };
}
