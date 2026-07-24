import type { BookingStatus, Prisma } from '@prisma/client';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';
import { toPrismaBookingPaymentIntent } from './booking-payment-intent.types';

/** Fields clients may never set — server-owned lifecycle and finance state. */
export const BOOKING_CLIENT_FORBIDDEN_FIELDS = [
  'organizationId',
  'organization',
  'paymentStatus',
  'cancelledAt',
  'completedAt',
  'kmDriven',
  'dailyRateCents',
  'totalPriceCents',
  'currency',
  'kmIncluded',
  'createdAt',
  'updatedAt',
  'id',
] as const;

export function bookingVehicleOverlapLockKey(
  organizationId: string,
  vehicleId: string,
): string {
  return `booking-vehicle-overlap:${organizationId}:${vehicleId}`;
}

export function toBookingCreateInput(
  dto: CreateBookingDto,
): Omit<Prisma.BookingCreateInput, 'organization'> & { quoteId: string } {
  return {
    vehicle: { connect: { id: dto.vehicleId } },
    customer: { connect: { id: dto.customerId } },
    startDate: new Date(dto.startDate),
    endDate: new Date(dto.endDate),
    quoteId: dto.quoteId,
    status: (dto.status ?? 'PENDING') as BookingStatus,
    notes: dto.notes ?? undefined,
    paymentIntent: dto.paymentIntent
      ? toPrismaBookingPaymentIntent(dto.paymentIntent)
      : undefined,
    pickupStation: dto.pickupStationId
      ? { connect: { id: dto.pickupStationId } }
      : undefined,
    returnStation: dto.returnStationId
      ? { connect: { id: dto.returnStationId } }
      : undefined,
    assignedDriver: dto.assignedDriverId
      ? { connect: { id: dto.assignedDriverId } }
      : undefined,
    pickupAddressOverride: dto.pickupAddressOverride ?? undefined,
    returnAddressOverride: dto.returnAddressOverride ?? undefined,
    isOneWayRental: dto.isOneWayRental,
    insuranceOptions: dto.insuranceOptions as Prisma.InputJsonValue | undefined,
    extrasJson: dto.extrasJson as Prisma.InputJsonValue | undefined,
    pricingInput: dto.pricingInput as Prisma.InputJsonValue | undefined,
  } as Omit<Prisma.BookingCreateInput, 'organization'> & { quoteId: string };
}

export function toBookingUpdateInput(dto: UpdateBookingDto): Prisma.BookingUpdateInput {
  const data: Prisma.BookingUpdateInput = {};

  if (dto.vehicleId !== undefined) {
    data.vehicle = { connect: { id: dto.vehicleId } };
  }
  if (dto.customerId !== undefined) {
    data.customer = { connect: { id: dto.customerId } };
  }
  if (dto.startDate !== undefined) {
    data.startDate = new Date(dto.startDate);
  }
  if (dto.endDate !== undefined) {
    data.endDate = new Date(dto.endDate);
  }
  if (dto.quoteId !== undefined) {
    (data as Record<string, unknown>).quoteId = dto.quoteId;
  }
  if (dto.status !== undefined) {
    data.status = dto.status;
  }
  if (dto.notes !== undefined) {
    data.notes = dto.notes;
  }
  if (dto.paymentIntent !== undefined) {
    data.paymentIntent = dto.paymentIntent
      ? toPrismaBookingPaymentIntent(dto.paymentIntent)
      : null;
  }
  if (dto.pickupStationId !== undefined) {
    data.pickupStation = dto.pickupStationId
      ? { connect: { id: dto.pickupStationId } }
      : { disconnect: true };
  }
  if (dto.returnStationId !== undefined) {
    data.returnStation = dto.returnStationId
      ? { connect: { id: dto.returnStationId } }
      : { disconnect: true };
  }
  if (dto.assignedDriverId !== undefined) {
    data.assignedDriver = dto.assignedDriverId
      ? { connect: { id: dto.assignedDriverId } }
      : { disconnect: true };
  }
  if (dto.pickupAddressOverride !== undefined) {
    data.pickupAddressOverride = dto.pickupAddressOverride;
  }
  if (dto.returnAddressOverride !== undefined) {
    data.returnAddressOverride = dto.returnAddressOverride;
  }
  if (dto.isOneWayRental !== undefined) {
    data.isOneWayRental = dto.isOneWayRental;
  }
  if (dto.insuranceOptions !== undefined) {
    data.insuranceOptions = dto.insuranceOptions as Prisma.InputJsonValue;
  }
  if (dto.extrasJson !== undefined) {
    data.extrasJson = dto.extrasJson as Prisma.InputJsonValue;
  }
  if (dto.pricingInput !== undefined) {
    (data as Record<string, unknown>).pricingInput = dto.pricingInput;
  }

  return data;
}
