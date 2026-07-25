import type { BookingDetailDto } from '@modules/bookings/booking-detail.types';
import {
  maskDisplayName,
  maskEmail,
  maskPhoneNumber,
  toCustomerReference,
} from '@shared/privacy/customer-privacy.util';
import type {
  OperatorBookingContextDto,
  OperatorCustomerDocumentStatusDto,
  OperatorCustomerSearchItemDto,
  OperatorDocumentSlotStatusDto,
  OperatorMinCustomerDto,
  OperatorMinStationDto,
  OperatorMinVehicleDto,
  OperatorProcess,
} from './operator-data.types';
import { buildOperatorBookingActions } from './operator-booking-actions.util';

export function mapOperatorMinCustomer(
  detail: BookingDetailDto,
  process: OperatorProcess,
  canViewFullDocuments: boolean,
): OperatorMinCustomerDto {
  const revealContact = process === 'BOOKING_FORM' && canViewFullDocuments;
  return {
    customerId: detail.customer.customerId,
    customerRef: toCustomerReference(detail.customer.customerId),
    displayName: canViewFullDocuments
      ? detail.customer.fullName
      : maskDisplayName(detail.customer.fullName),
    identityStatus: detail.customer.identityStatus,
    licenseStatus: detail.customer.licenseStatus,
    emailMasked: revealContact ? maskEmail(detail.customer.email) : null,
    phoneMasked: revealContact ? maskPhoneNumber(detail.customer.phone) : null,
  };
}

export function mapOperatorMinVehicle(detail: BookingDetailDto): OperatorMinVehicleDto {
  return {
    vehicleId: detail.vehicle.vehicleId,
    displayName: detail.vehicle.displayName,
    licensePlate: detail.vehicle.licensePlate,
    odometerKm: detail.vehicle.odometerKm,
    fuelPercent: detail.vehicle.fuelPercent ?? detail.vehicle.evSoc,
  };
}

export function mapOperatorMinStation(
  station: BookingDetailDto['stations']['pickup'],
): OperatorMinStationDto {
  return {
    stationId: station?.stationId ?? null,
    name: station?.name ?? null,
  };
}

export function mapBookingDocumentSlots(
  detail: BookingDetailDto,
  canViewFull: boolean,
): OperatorDocumentSlotStatusDto[] {
  return detail.documents.slots.map((slot) => ({
    documentType: slot.documentType,
    status: slot.status,
    available: slot.available,
    documentId: canViewFull ? slot.documentId : null,
    label: canViewFull ? slot.documentType : null,
  }));
}

export function mapCustomerDocumentStatusRows(
  rows: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: Date;
    expiresAt: Date | null;
  }>,
  canViewFull: boolean,
): OperatorCustomerDocumentStatusDto[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    uploadedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    canViewFull,
  }));
}

export function buildOperatorBookingContext(
  process: OperatorProcess,
  detail: BookingDetailDto,
  options: {
    canViewFullDocuments: boolean;
    customerDocuments: OperatorCustomerDocumentStatusDto[];
    canStartPickup: boolean;
    canStartReturn: boolean;
  },
): OperatorBookingContextDto {
  const rentalBlocked = Boolean(
    detail.health.rentalBlocked || detail.vehicle.rentalBlocked,
  );
  return {
    process,
    bookingId: detail.core.bookingId,
    bookingNumber: detail.core.bookingNumber,
    status: detail.core.status,
    startDate: detail.core.startDate,
    endDate: detail.core.endDate,
    customer: mapOperatorMinCustomer(detail, process, options.canViewFullDocuments),
    vehicle: mapOperatorMinVehicle(detail),
    pickupStation: mapOperatorMinStation(detail.stations.pickup),
    returnStation: mapOperatorMinStation(detail.stations.return),
    canStartPickup: options.canStartPickup,
    canStartReturn: options.canStartReturn,
    documentsAcknowledgedRequired: true,
    bookingDocumentSlots: mapBookingDocumentSlots(detail, options.canViewFullDocuments),
    customerDocumentSlots: options.customerDocuments,
    health: {
      rentalBlocked,
      blockingReasons: detail.health.blockingReasons ?? [],
    },
    actions: buildOperatorBookingActions(detail),
    handover: {
      statusEnum: detail.core.statusEnum,
      kmIncluded: detail.core.kmIncluded,
      pickupStationId: detail.core.pickupStationId,
      returnStationId: detail.core.returnStationId,
      handoverInstructions: detail.stations.pickup?.handoverInstructions ?? null,
      returnInstructions: detail.stations.return?.returnInstructions ?? null,
      pickupOdometerKm: detail.handover.pickup?.odometerKm ?? null,
      hasPickupProtocol: Boolean(detail.handover.pickup),
      hasReturnProtocol: Boolean(detail.handover.return),
    },
  };
}

export function mapOperatorCustomerSearchRow(
  customer: Record<string, unknown>,
): OperatorCustomerSearchItemDto {
  const fullName =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() ||
    (typeof customer.fullName === 'string' ? customer.fullName : '');
  return {
    customerId: String(customer.id),
    customerRef: toCustomerReference(String(customer.id)),
    displayName: maskDisplayName(fullName),
    emailMasked: maskEmail(typeof customer.email === 'string' ? customer.email : null),
    phoneMasked: maskPhoneNumber(typeof customer.phone === 'string' ? customer.phone : null),
    identityStatus: typeof customer.idVerificationStatus === 'string'
      ? customer.idVerificationStatus
      : typeof customer.identityStatus === 'string'
        ? customer.identityStatus
        : null,
    licenseStatus: typeof customer.licenseVerificationStatus === 'string'
      ? customer.licenseVerificationStatus
      : typeof customer.licenseStatus === 'string'
        ? customer.licenseStatus
        : null,
  };
}
