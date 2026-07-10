import { BadRequestException } from '@nestjs/common';
import { PriceTariffVersionStatus } from '@prisma/client';

export const EDITABLE_TARIFF_VERSION_STATUSES: readonly PriceTariffVersionStatus[] = ['DRAFT'];

export const BOOKING_ELIGIBLE_TARIFF_VERSION_STATUSES: readonly PriceTariffVersionStatus[] = [
  'ACTIVE',
];

/** Allowed explicit status transitions (from → to). */
export const TARIFF_VERSION_TRANSITIONS: Readonly<
  Record<PriceTariffVersionStatus, readonly PriceTariffVersionStatus[]>
> = {
  DRAFT: ['ACTIVE', 'SCHEDULED'],
  SCHEDULED: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED'],
  ARCHIVED: [],
};

export function assertTariffVersionEditable(status: PriceTariffVersionStatus): void {
  if (!EDITABLE_TARIFF_VERSION_STATUSES.includes(status)) {
    throw new BadRequestException({
      message: 'Nur Entwürfe können bearbeitet werden',
      code: 'TARIFF_VERSION_NOT_EDITABLE',
      status,
    });
  }
}

export function assertTariffVersionPublishable(status: PriceTariffVersionStatus): void {
  if (status === 'ACTIVE') {
    throw new BadRequestException({
      message: 'Tarifversion ist bereits aktiv',
      code: 'TARIFF_VERSION_ALREADY_ACTIVE',
    });
  }
  if (status === 'ARCHIVED') {
    throw new BadRequestException({
      message: 'Archivierte Versionen können nicht veröffentlicht werden',
      code: 'TARIFF_VERSION_ARCHIVED',
    });
  }
  if (status === 'SCHEDULED') {
    throw new BadRequestException({
      message: 'Geplante Versionen können nicht erneut veröffentlicht werden',
      code: 'TARIFF_VERSION_SCHEDULED',
    });
  }
  if (status !== 'DRAFT') {
    throw new BadRequestException({
      message: 'Nur Entwürfe können veröffentlicht werden',
      code: 'TARIFF_INVALID_STATUS',
      status,
    });
  }
}

export function assertTariffStatusTransition(
  from: PriceTariffVersionStatus,
  to: PriceTariffVersionStatus,
): void {
  const allowed = TARIFF_VERSION_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new BadRequestException({
      message: `Statusübergang ${from} → ${to} ist nicht erlaubt`,
      code: 'TARIFF_STATUS_TRANSITION_FORBIDDEN',
      from,
      to,
    });
  }
}

/** Publish now → ACTIVE; future effectiveFrom → SCHEDULED (no FX / no silent changes). */
export function resolvePublishTargetStatus(
  effectiveFrom: Date,
  now: Date = new Date(),
): 'ACTIVE' | 'SCHEDULED' {
  return effectiveFrom.getTime() > now.getTime() ? 'SCHEDULED' : 'ACTIVE';
}

export function isBookingEligibleTariffStatus(status: PriceTariffVersionStatus): boolean {
  return BOOKING_ELIGIBLE_TARIFF_VERSION_STATUSES.includes(status);
}
