import { BadRequestException } from '@nestjs/common';
import { parseBookingInstant } from '@modules/pricing/tariff-instant.util';
import { toPrismaBookingPaymentIntent } from './booking-payment-intent.types';
import { BOOKING_CREATE_ERROR_CODES } from './booking-create-error.codes';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';
import type { CreateBookingCommand, UpdateBookingCommand } from './booking-command.types';

function assertCreateBookingDtoRequiredFields(dto: CreateBookingDto): void {
  const hasPickup = Boolean(dto.pickupAt?.trim() || dto.startDate?.trim());
  const hasReturn = Boolean(dto.returnAt?.trim() || dto.endDate?.trim());
  const hasQuote = Boolean(dto.pricingQuoteId?.trim() || dto.quoteId?.trim());
  if (!hasPickup || !hasReturn || !hasQuote) {
    throw new BadRequestException({
      message:
        'pickupAt, returnAt and pricingQuoteId are required (legacy aliases: startDate, endDate, quoteId)',
      code: BOOKING_CREATE_ERROR_CODES.BOOKING_INVALID_DATES,
    });
  }
}

function resolveAliasField(
  canonical: string | undefined,
  legacy: string | undefined,
  fieldLabel: string,
  code: string,
): string {
  const canonicalTrimmed = canonical?.trim();
  const legacyTrimmed = legacy?.trim();
  if (canonicalTrimmed && legacyTrimmed && canonicalTrimmed !== legacyTrimmed) {
    throw new BadRequestException({
      message: `Conflicting values for ${fieldLabel}`,
      code,
    });
  }
  const resolved = canonicalTrimmed || legacyTrimmed;
  if (!resolved) {
    throw new BadRequestException({
      message: `${fieldLabel} is required`,
      code: BOOKING_CREATE_ERROR_CODES.BOOKING_INVALID_DATES,
    });
  }
  return resolved;
}

function parseBookingDate(value: string, field: string): Date {
  try {
    return parseBookingInstant(value);
  } catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        throw new BadRequestException({
          ...(response as Record<string, unknown>),
          field,
        });
      }
    }
    throw new BadRequestException({
      message: `Invalid ${field}`,
      code: BOOKING_CREATE_ERROR_CODES.INVALID_BOOKING_INSTANT,
      field,
    });
  }
}

export function mergeBookingNotesForStorage(
  customerNotes?: string,
  internalNotes?: string,
): string | undefined {
  const customer = customerNotes?.trim() ?? '';
  const internal = internalNotes?.trim() ?? '';
  if (customer && internal) {
    return `${customer}\n\n[Internal]\n${internal}`;
  }
  const merged = customer || internal;
  return merged.length > 0 ? merged : undefined;
}

export function mapCreateBookingDtoToCommand(dto: CreateBookingDto): CreateBookingCommand {
  assertCreateBookingDtoRequiredFields(dto);

  const pickupRaw = resolveAliasField(
    dto.pickupAt,
    dto.startDate,
    'pickupAt',
    BOOKING_CREATE_ERROR_CODES.BOOKING_CONFLICTING_DATE_ALIASES,
  );
  const returnRaw = resolveAliasField(
    dto.returnAt,
    dto.endDate,
    'returnAt',
    BOOKING_CREATE_ERROR_CODES.BOOKING_CONFLICTING_DATE_ALIASES,
  );
  const quoteId = resolveAliasField(
    dto.pricingQuoteId,
    dto.quoteId,
    'pricingQuoteId',
    BOOKING_CREATE_ERROR_CODES.BOOKING_CONFLICTING_QUOTE_ALIASES,
  );

  const customerNotes = dto.customerNotes ?? dto.notes;
  const paymentIntent = dto.paymentIntent ?? dto.paymentMethodIntent;

  return {
    customerId: dto.customerId,
    vehicleId: dto.vehicleId,
    pickupAt: parseBookingDate(pickupRaw, 'pickupAt'),
    returnAt: parseBookingDate(returnRaw, 'returnAt'),
    pricingQuoteId: quoteId,
    pickupStationId: dto.pickupStationId,
    returnStationId: dto.returnStationId,
    pickupAddressOverride: dto.pickupAddressOverride,
    returnAddressOverride: dto.returnAddressOverride,
    customerNotes,
    internalNotes: dto.internalNotes,
    status: dto.status,
    paymentIntent,
    kmIncluded: dto.kmIncluded,
    currency: dto.currency?.trim().toLowerCase(),
    insuranceOptions: dto.insuranceOptions,
    extrasJson: dto.extrasJson,
    pricingInput: dto.pricingInput,
    allowedDriverIds: dto.allowedDriverIds,
    isOneWayRental: dto.isOneWayRental,
  };
}

export function mapUpdateBookingDtoToCommand(dto: UpdateBookingDto): UpdateBookingCommand {
  const command: UpdateBookingCommand = {};

  if (dto.startDate !== undefined) {
    command.startDate = parseBookingDate(dto.startDate, 'startDate');
  }
  if (dto.endDate !== undefined) {
    command.endDate = parseBookingDate(dto.endDate, 'endDate');
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

export function createCommandPaymentIntentForPrisma(
  command: CreateBookingCommand,
): ReturnType<typeof toPrismaBookingPaymentIntent> | undefined {
  return command.paymentIntent
    ? toPrismaBookingPaymentIntent(command.paymentIntent)
    : undefined;
}
