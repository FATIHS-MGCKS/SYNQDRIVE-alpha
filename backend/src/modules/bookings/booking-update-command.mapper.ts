import { BadRequestException } from '@nestjs/common';
import { parseBookingInstant } from '@modules/pricing/tariff-instant.util';
import { mergeBookingNotesForStorage } from './booking-command.mapper';
import { BOOKING_UPDATE_ERROR_CODES } from './booking-update-error.codes';
import type {
  UpdateBookingAllowedDriversCommand,
  UpdateBookingCustomerCommand,
  UpdateBookingNotesCommand,
  UpdateBookingOptionsCommand,
  UpdateBookingScheduleCommand,
  UpdateBookingStationsCommand,
  UpdateBookingVehicleCommand,
} from './booking-update-command.types';
import type { UpdateBookingAllowedDriversDto } from './dto/updates/update-booking-allowed-drivers.dto';
import type { UpdateBookingCustomerDto } from './dto/updates/update-booking-customer.dto';
import type { UpdateBookingNotesDto } from './dto/updates/update-booking-notes.dto';
import type { UpdateBookingOptionsDto } from './dto/updates/update-booking-options.dto';
import type { UpdateBookingScheduleDto } from './dto/updates/update-booking-schedule.dto';
import type { UpdateBookingStationsDto } from './dto/updates/update-booking-stations.dto';
import type { UpdateBookingVehicleDto } from './dto/updates/update-booking-vehicle.dto';

function parseExpectedUpdatedAt(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      message: 'Invalid expectedUpdatedAt',
      code: BOOKING_UPDATE_ERROR_CODES.BOOKING_INVALID_DATES,
    });
  }
  return parsed;
}

function resolveAliasField(
  canonical: string | undefined,
  legacy: string | undefined,
  fieldLabel: string,
): string | undefined {
  const canonicalTrimmed = canonical?.trim();
  const legacyTrimmed = legacy?.trim();
  if (canonicalTrimmed && legacyTrimmed && canonicalTrimmed !== legacyTrimmed) {
    throw new BadRequestException({
      message: `Conflicting values for ${fieldLabel}`,
      code: BOOKING_UPDATE_ERROR_CODES.BOOKING_INVALID_DATES,
    });
  }
  return canonicalTrimmed || legacyTrimmed;
}

function parseOptionalInstant(value: string | undefined, field: string): Date | undefined {
  if (!value?.trim()) return undefined;
  try {
    return parseBookingInstant(value);
  } catch {
    throw new BadRequestException({
      message: `Invalid ${field}`,
      code: BOOKING_UPDATE_ERROR_CODES.BOOKING_INVALID_DATES,
      field,
    });
  }
}

function mapConcurrency<T extends { expectedUpdatedAt: string; allowTerminalOverride?: boolean }>(
  dto: T,
): { expectedUpdatedAt: Date; allowTerminalOverride?: boolean } {
  return {
    expectedUpdatedAt: parseExpectedUpdatedAt(dto.expectedUpdatedAt),
    allowTerminalOverride: dto.allowTerminalOverride,
  };
}

export function mapUpdateBookingScheduleDtoToCommand(
  dto: UpdateBookingScheduleDto,
): UpdateBookingScheduleCommand {
  const pickupRaw = resolveAliasField(dto.pickupAt, dto.startDate, 'pickupAt');
  const returnRaw = resolveAliasField(dto.returnAt, dto.endDate, 'returnAt');
  const quoteId = resolveAliasField(dto.pricingQuoteId, dto.quoteId, 'pricingQuoteId');
  return {
    ...mapConcurrency(dto),
    pickupAt: parseOptionalInstant(pickupRaw, 'pickupAt'),
    returnAt: parseOptionalInstant(returnRaw, 'returnAt'),
    pricingQuoteId: quoteId,
  };
}

export function mapUpdateBookingCustomerDtoToCommand(
  dto: UpdateBookingCustomerDto,
): UpdateBookingCustomerCommand {
  return {
    ...mapConcurrency(dto),
    customerId: dto.customerId,
  };
}

export function mapUpdateBookingVehicleDtoToCommand(
  dto: UpdateBookingVehicleDto,
): UpdateBookingVehicleCommand {
  const quoteId = resolveAliasField(dto.pricingQuoteId, dto.quoteId, 'pricingQuoteId');
  return {
    ...mapConcurrency(dto),
    vehicleId: dto.vehicleId,
    pricingQuoteId: quoteId,
  };
}

export function mapUpdateBookingStationsDtoToCommand(
  dto: UpdateBookingStationsDto,
): UpdateBookingStationsCommand {
  return {
    ...mapConcurrency(dto),
    pickupStationId: dto.pickupStationId,
    returnStationId: dto.returnStationId,
    pickupAddressOverride: dto.pickupAddressOverride,
    returnAddressOverride: dto.returnAddressOverride,
    isOneWayRental: dto.isOneWayRental,
  };
}

export function mapUpdateBookingNotesDtoToCommand(
  dto: UpdateBookingNotesDto,
): UpdateBookingNotesCommand {
  return {
    expectedUpdatedAt: parseExpectedUpdatedAt(dto.expectedUpdatedAt),
    customerNotes: dto.customerNotes ?? dto.notes,
    internalNotes: dto.internalNotes,
  };
}

export function mapUpdateBookingOptionsDtoToCommand(
  dto: UpdateBookingOptionsDto,
): UpdateBookingOptionsCommand {
  const quoteId = resolveAliasField(dto.pricingQuoteId, dto.quoteId, 'pricingQuoteId');
  return {
    ...mapConcurrency(dto),
    pricingInput: dto.pricingInput,
    pricingQuoteId: quoteId,
    kmIncluded: dto.kmIncluded,
    insuranceOptions: dto.insuranceOptions,
    extrasJson: dto.extrasJson,
  };
}

export function mapUpdateBookingAllowedDriversDtoToCommand(
  dto: UpdateBookingAllowedDriversDto,
): UpdateBookingAllowedDriversCommand {
  return {
    ...mapConcurrency(dto),
    allowedDriverIds: dto.allowedDriverIds,
    primaryDriverId: dto.primaryDriverId,
  };
}

export function mergeNotesCommandToStorage(command: UpdateBookingNotesCommand): string | null {
  const merged = mergeBookingNotesForStorage(command.customerNotes, command.internalNotes);
  return merged ?? null;
}
