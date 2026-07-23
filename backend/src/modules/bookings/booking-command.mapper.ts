import { BadRequestException } from '@nestjs/common';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';
import type { CreateBookingCommand, UpdateBookingCommand } from './booking-command.types';

function parseIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return date;
}

export function mapCreateBookingDtoToCommand(dto: CreateBookingDto): CreateBookingCommand {
  return {
    customerId: dto.customerId,
    vehicleId: dto.vehicleId,
    startDate: parseIsoDate(dto.startDate, 'startDate'),
    endDate: parseIsoDate(dto.endDate, 'endDate'),
    quoteId: dto.quoteId,
    pickupStationId: dto.pickupStationId,
    returnStationId: dto.returnStationId,
    pickupAddressOverride: dto.pickupAddressOverride,
    returnAddressOverride: dto.returnAddressOverride,
    notes: dto.notes,
    status: dto.status,
    kmIncluded: dto.kmIncluded,
    currency: dto.currency?.toLowerCase(),
    insuranceOptions: dto.insuranceOptions,
    extrasJson: dto.extrasJson,
    pricingInput: dto.pricingInput,
    dailyRateCents: dto.dailyRateCents,
    totalPriceCents: dto.totalPriceCents,
  };
}

export function mapUpdateBookingDtoToCommand(dto: UpdateBookingDto): UpdateBookingCommand {
  const command: UpdateBookingCommand = {};

  if (dto.startDate !== undefined) {
    command.startDate = parseIsoDate(dto.startDate, 'startDate');
  }
  if (dto.endDate !== undefined) {
    command.endDate = parseIsoDate(dto.endDate, 'endDate');
  }
  if (dto.notes !== undefined) command.notes = dto.notes;
  if (dto.kmIncluded !== undefined) command.kmIncluded = dto.kmIncluded;
  if (dto.status !== undefined) command.status = dto.status;
  if (dto.vehicleId !== undefined) command.vehicleId = dto.vehicleId;
  if (dto.customerId !== undefined) command.customerId = dto.customerId;
  if (dto.pickupStationId !== undefined) command.pickupStationId = dto.pickupStationId;
  if (dto.returnStationId !== undefined) command.returnStationId = dto.returnStationId;
  if (dto.pickupAddressOverride !== undefined) {
    command.pickupAddressOverride = dto.pickupAddressOverride;
  }
  if (dto.returnAddressOverride !== undefined) {
    command.returnAddressOverride = dto.returnAddressOverride;
  }
  if (dto.actualPickupStationId !== undefined) {
    command.actualPickupStationId = dto.actualPickupStationId;
  }
  if (dto.actualReturnStationId !== undefined) {
    command.actualReturnStationId = dto.actualReturnStationId;
  }
  if (dto.isOneWayRental !== undefined) command.isOneWayRental = dto.isOneWayRental;
  if (dto.stationTransferFeeCents !== undefined) {
    command.stationTransferFeeCents = dto.stationTransferFeeCents;
  }
  if (dto.insuranceOptions !== undefined) command.insuranceOptions = dto.insuranceOptions;
  if (dto.extrasJson !== undefined) command.extrasJson = dto.extrasJson;
  if (dto.pricingInput !== undefined) command.pricingInput = dto.pricingInput;

  return command;
}

/** Shape used by field-level PATCH permission checks — no Prisma types. */
export function updateCommandToPermissionBody(
  command: UpdateBookingCommand,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (command.startDate !== undefined) body.startDate = command.startDate;
  if (command.endDate !== undefined) body.endDate = command.endDate;
  if (command.customerId !== undefined) body.customerId = command.customerId;
  if (command.vehicleId !== undefined) body.vehicleId = command.vehicleId;
  if (command.status !== undefined) body.status = command.status;
  return body;
}
