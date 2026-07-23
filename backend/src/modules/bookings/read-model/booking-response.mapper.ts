import type { HandoverProtocolDto } from '../handover.types';
import type {
  BookingCalendarItemDto,
  BookingHandoverSideDto,
  BookingHandoverSummaryDto,
  BookingListItemDto,
} from '../dto/response';

const BOOKING_STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export const BOOKING_LIST_FORBIDDEN_FIELDS = [
  'customerSignatureDataUrl',
  'staffSignatureDataUrl',
  'signatureDataUrl',
  'objectKey',
  'stripeCheckoutSessionId',
  'stripePaymentIntentId',
  'stripeChargeId',
  'checkoutUrl',
  'organizationId',
  'notes',
  'insuranceOptions',
  'extras',
  'extrasJson',
  'dailyRate',
] as const;

export const BOOKING_PAYMENT_FORBIDDEN_FIELDS = [
  'stripeCheckoutSessionId',
  'stripePaymentIntentId',
  'stripeChargeId',
  'checkoutUrl',
  'objectKey',
] as const;

export const BOOKING_DETAIL_FORBIDDEN_FIELDS = [
  'customerSignatureDataUrl',
  'staffSignatureDataUrl',
  'signatureDataUrl',
  'objectKey',
  'organizationId',
] as const;

export function formatBookingNumber(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

export function mapHandoverProtocolToSummary(
  protocol: HandoverProtocolDto | null,
): BookingHandoverSummaryDto | null {
  if (!protocol) return null;
  return {
    protocolId: protocol.id,
    kind: protocol.kind,
    completedAt: protocol.performedAt,
    protocolCompleted: protocol.protocolCompleted,
    odometerKm: protocol.odometerKm,
    fuelPercent: protocol.fuelPercent,
    fuelFull: protocol.fuelFull,
    damageCount: protocol.damageIds.length,
  };
}

export function mapHandoverProtocolToSide(
  protocol: HandoverProtocolDto | null,
): BookingHandoverSideDto | null {
  if (!protocol) return null;
  return {
    protocolId: protocol.id,
    status: 'completed',
    completedAt: protocol.performedAt,
    odometerKm: protocol.odometerKm,
    fuelPercent: protocol.fuelPercent,
    fuelFull: protocol.fuelFull,
    damageCount: protocol.damageIds.length,
    protocolCompleted: protocol.protocolCompleted,
    customerSignature: protocol.customerSignature,
    staffSignature: protocol.staffSignature,
    performedByName: protocol.performedByName,
  };
}

export function mapBookingListItem(input: {
  booking: {
    id: string;
    vehicleId: string;
    customerId: string;
    pickupStationId: string | null;
    returnStationId: string | null;
    startDate: Date;
    endDate: Date;
    status: string;
    totalPriceCents: number | null;
    currency: string;
    kmIncluded: number | null;
    kmDriven: number | null;
    isOneWayRental: boolean | null;
    actualPickupStationId: string | null;
    actualReturnStationId: string | null;
    customer: { firstName: string; lastName: string };
    vehicle: {
      vehicleName?: string | null;
      make: string;
      model: string;
      licensePlate?: string | null;
    };
  };
  stationMap: Map<string, string>;
  pickup: HandoverProtocolDto | null;
  returnProtocol: HandoverProtocolDto | null;
}): BookingListItemDto {
  const b = input.booking;
  const pickupStationName = b.pickupStationId
    ? input.stationMap.get(b.pickupStationId) || ''
    : '';
  const returnStationName = b.returnStationId
    ? input.stationMap.get(b.returnStationId) || ''
    : '';

  return {
    id: b.id,
    bookingNumber: formatBookingNumber(b.id),
    vehicleId: b.vehicleId,
    customerId: b.customerId,
    pickupStationId: b.pickupStationId,
    returnStationId: b.returnStationId,
    customerName: `${b.customer.firstName} ${b.customer.lastName}`.trim(),
    vehicleName: b.vehicle.vehicleName || `${b.vehicle.make} ${b.vehicle.model}`.trim(),
    vehicleLicense: b.vehicle.licensePlate || '',
    pickupStationName,
    returnStationName,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
    status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
    statusEnum: b.status,
    totalPriceCents: b.totalPriceCents,
    currency: b.currency,
    kmIncluded: b.kmIncluded || 0,
    kmDriven: b.kmDriven || 0,
    pickupHandover: mapHandoverProtocolToSummary(input.pickup),
    returnHandover: mapHandoverProtocolToSummary(input.returnProtocol),
    isOneWayRental: b.isOneWayRental ?? false,
    actualPickupStationId: b.actualPickupStationId ?? null,
    actualReturnStationId: b.actualReturnStationId ?? null,
  };
}

export function mapBookingCalendarItem(
  listItem: BookingListItemDto,
): BookingCalendarItemDto {
  return {
    id: listItem.id,
    bookingNumber: listItem.bookingNumber,
    vehicleId: listItem.vehicleId,
    customerId: listItem.customerId,
    customerName: listItem.customerName,
    vehicleName: listItem.vehicleName,
    vehicleLicense: listItem.vehicleLicense,
    startDate: listItem.startDate,
    endDate: listItem.endDate,
    statusEnum: listItem.statusEnum,
    pickupStationId: listItem.pickupStationId,
    returnStationId: listItem.returnStationId,
    pickupStationName: listItem.pickupStationName,
    returnStationName: listItem.returnStationName,
    pickupHandover: listItem.pickupHandover,
    returnHandover: listItem.returnHandover,
    isOneWayRental: listItem.isOneWayRental,
  };
}

/** Backward-compatible aliases for legacy consumers expecting pickupProtocol keys. */
export function toLegacyListRowCompat(dto: BookingListItemDto): Record<string, unknown> {
  return {
    ...dto,
    station: dto.pickupStationName,
    totalPrice: dto.totalPriceCents != null ? dto.totalPriceCents / 100 : 0,
    pickupProtocol: dto.pickupHandover
      ? {
          id: dto.pickupHandover.protocolId,
          kind: dto.pickupHandover.kind,
          performedAt: dto.pickupHandover.completedAt,
          odometerKm: dto.pickupHandover.odometerKm,
          fuelPercent: dto.pickupHandover.fuelPercent,
          fuelFull: dto.pickupHandover.fuelFull,
          protocolCompleted: dto.pickupHandover.protocolCompleted,
        }
      : null,
    returnProtocol: dto.returnHandover
      ? {
          id: dto.returnHandover.protocolId,
          kind: dto.returnHandover.kind,
          performedAt: dto.returnHandover.completedAt,
          odometerKm: dto.returnHandover.odometerKm,
          fuelPercent: dto.returnHandover.fuelPercent,
          fuelFull: dto.returnHandover.fuelFull,
          protocolCompleted: dto.returnHandover.protocolCompleted,
        }
      : null,
  };
}

export function estimateJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function collectForbiddenFields(
  value: unknown,
  forbidden: readonly string[],
  path = '',
  found: string[] = [],
): string[] {
  if (value == null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectForbiddenFields(entry, forbidden, path, found);
    }
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key;
    if ((forbidden as readonly string[]).includes(key)) {
      if (child !== null && child !== undefined) {
        found.push(fullPath);
      }
    }
    collectForbiddenFields(child, forbidden, fullPath, found);
  }
  return found;
}
