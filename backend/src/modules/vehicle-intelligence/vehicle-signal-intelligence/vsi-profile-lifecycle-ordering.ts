import type { VehicleDataSourceLink } from '@prisma/client';

/**
 * Returns false when a lifecycle event is stale relative to authoritative link timestamps.
 * Preserves historical profile evidence — stale events are no-ops.
 */
export function shouldApplySourceLinkActivatedEvent(
  link: Pick<VehicleDataSourceLink, 'isActive' | 'activatedAt' | 'deactivatedAt'>,
  eventOccurredAt: Date,
): boolean {
  if (!link.isActive) {
    if (link.deactivatedAt && eventOccurredAt <= link.deactivatedAt) {
      return false;
    }
    return false;
  }
  if (link.activatedAt && eventOccurredAt < link.activatedAt) {
    return false;
  }
  return true;
}

export function shouldApplySourceLinkDeactivatedEvent(
  link: Pick<VehicleDataSourceLink, 'isActive' | 'activatedAt' | 'deactivatedAt'>,
  eventOccurredAt: Date,
): boolean {
  if (link.isActive) {
    if (link.activatedAt && eventOccurredAt < link.activatedAt) {
      return false;
    }
    return false;
  }
  if (link.deactivatedAt && eventOccurredAt < link.deactivatedAt) {
    return false;
  }
  return true;
}
