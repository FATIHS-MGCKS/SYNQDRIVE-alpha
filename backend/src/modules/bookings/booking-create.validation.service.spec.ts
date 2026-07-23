import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BookingCreateValidationService } from './booking-create.validation.service';
import { BOOKING_CREATE_ERROR_CODES } from './booking-create-error.codes';
import type { CreateBookingCommand } from './booking-command.types';

const ORG_ID = 'org-1';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const QUOTE_ID = '33333333-3333-4333-8333-333333333333';
const STATION_A = '44444444-4444-4444-8444-444444444444';
const DRIVER_ID = '55555555-5555-4555-8555-555555555555';

function baseCommand(overrides: Partial<CreateBookingCommand> = {}): CreateBookingCommand {
  return {
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    pickupAt: new Date('2026-08-01T10:00:00.000Z'),
    returnAt: new Date('2026-08-05T10:00:00.000Z'),
    pricingQuoteId: QUOTE_ID,
    pickupStationId: STATION_A,
    returnStationId: STATION_A,
    ...overrides,
  };
}

function buildService(overrides?: {
  prisma?: Partial<Record<string, unknown>>;
  stationValidation?: Partial<Record<string, unknown>>;
  rentalHealth?: Partial<Record<string, unknown>>;
  customerEligibility?: Partial<Record<string, unknown>>;
  pricingQuote?: Partial<Record<string, unknown>>;
}) {
  const prisma = {
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
      findMany: jest.fn().mockResolvedValue([{ id: DRIVER_ID }]),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: VEHICLE_ID }),
    },
    station: {
      findMany: jest.fn().mockResolvedValue([{ id: STATION_A }]),
    },
    pricingQuote: {
      findFirst: jest.fn().mockResolvedValue({
        id: QUOTE_ID,
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        currency: 'eur',
        pricingContextJson: {
          rate: { minimumRentalDays: 2 },
        },
        pricingInputJson: {},
      }),
    },
    ...overrides?.prisma,
  };

  const stationValidation = {
    validateBookingStations: jest.fn().mockResolvedValue({
      isOneWayRental: false,
      pickupStationId: STATION_A,
      returnStationId: STATION_A,
    }),
    ...overrides?.stationValidation,
  };

  const rentalHealthService = {
    isRentalBlocked: jest.fn().mockResolvedValue({
      blocked: false,
      healthGateStatus: 'OK',
      reasons: [],
      healthGateWarning: null,
      manualReviewRequired: false,
    }),
    ...overrides?.rentalHealth,
  };

  const customerEligibilityService = {
    evaluateForBooking: jest.fn().mockResolvedValue({
      canCreatePendingBooking: true,
      canConfirmBooking: true,
      stages: {
        createBooking: { blockingReasons: [] },
        confirmBooking: { blockingReasons: [] },
      },
      warnings: [],
      requiredActions: [],
    }),
    ...overrides?.customerEligibility,
  };

  const pricingQuoteService = {
    assertQuoteReadyForBooking: jest.fn().mockResolvedValue({ id: QUOTE_ID }),
    ...overrides?.pricingQuote,
  };

  const service = new BookingCreateValidationService(
    prisma as never,
    stationValidation as never,
    rentalHealthService as never,
    customerEligibilityService as never,
    pricingQuoteService as never,
  );

  return {
    service,
    prisma,
    stationValidation,
    rentalHealthService,
    customerEligibilityService,
    pricingQuoteService,
  };
}

describe('BookingCreateValidationService', () => {
  it('accepts a valid create command', async () => {
    const { service } = buildService();
    const result = await service.validate(ORG_ID, baseCommand());
    expect(result.validatedAllowedDriverIds).toEqual([]);
    expect(result.notes).toBeNull();
  });

  it('rejects returnAt before pickupAt with stable code', async () => {
    const { service } = buildService();
    await expect(
      service.validate(
        ORG_ID,
        baseCommand({
          pickupAt: new Date('2026-08-05T10:00:00.000Z'),
          returnAt: new Date('2026-08-01T10:00:00.000Z'),
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_END_BEFORE_START,
      }),
    });
  });

  it('rejects unknown customer with stable code', async () => {
    const { service, prisma } = buildService();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.CUSTOMER_NOT_FOUND,
      }),
    });
  });

  it('rejects unknown vehicle with stable code', async () => {
    const { service, prisma } = buildService();
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_NOT_FOUND,
      }),
    });
  });

  it('rejects unknown station with stable code', async () => {
    const { service, prisma } = buildService();
    prisma.station.findMany.mockResolvedValue([]);
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects currency mismatch with stable code', async () => {
    const { service } = buildService();
    await expect(
      service.validate(ORG_ID, baseCommand({ currency: 'usd' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_CURRENCY_MISMATCH,
      }),
    });
  });

  it('rejects rental below tariff minimum days', async () => {
    const { service } = buildService();
    await expect(
      service.validate(
        ORG_ID,
        baseCommand({
          pickupAt: new Date('2026-08-01T10:00:00.000Z'),
          returnAt: new Date('2026-08-01T14:00:00.000Z'),
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_MINIMUM_RENTAL_DAYS,
      }),
    });
  });

  it('rejects blocked vehicle rental health', async () => {
    const { service, rentalHealthService } = buildService();
    rentalHealthService.isRentalBlocked.mockResolvedValue({
      blocked: true,
      healthGateStatus: 'BLOCKED',
      reasons: ['Service overdue'],
      healthGateWarning: null,
      manualReviewRequired: false,
    });
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_RENTAL_BLOCKED,
      }),
    });
  });

  it('rejects unavailable rental health gate', async () => {
    const { service, rentalHealthService } = buildService();
    rentalHealthService.isRentalBlocked.mockResolvedValue({
      blocked: false,
      healthGateStatus: 'UNAVAILABLE',
      reasons: [],
      healthGateWarning: 'Health check failed',
      manualReviewRequired: true,
    });
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects ineligible customer for pending booking', async () => {
    const { service, customerEligibilityService } = buildService();
    customerEligibilityService.evaluateForBooking.mockResolvedValue({
      canCreatePendingBooking: false,
      canConfirmBooking: false,
      stages: {
        createBooking: { blockingReasons: ['Blocked customer'] },
        confirmBooking: { blockingReasons: [] },
      },
      warnings: [],
      requiredActions: [],
    });
    await expect(service.validate(ORG_ID, baseCommand())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.CUSTOMER_BOOKING_BLOCKED,
      }),
    });
  });

  it('rejects contract holder in allowedDriverIds', async () => {
    const { service } = buildService();
    await expect(
      service.validate(ORG_ID, baseCommand({ allowedDriverIds: [CUSTOMER_ID] })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.ALLOWED_DRIVER_IS_CONTRACT_HOLDER,
      }),
    });
  });

  it('rejects duplicate allowedDriverIds', async () => {
    const { service } = buildService();
    await expect(
      service.validate(
        ORG_ID,
        baseCommand({ allowedDriverIds: [DRIVER_ID, DRIVER_ID] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects one-way flag mismatch', async () => {
    const { service, stationValidation } = buildService();
    stationValidation.validateBookingStations.mockResolvedValue({
      isOneWayRental: false,
      pickupStationId: STATION_A,
      returnStationId: STATION_A,
    });
    await expect(
      service.validate(ORG_ID, baseCommand({ isOneWayRental: true })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_CREATE_ERROR_CODES.ONE_WAY_RENTAL_MISMATCH,
      }),
    });
  });

  it('merges customer and internal notes', async () => {
    const { service } = buildService();
    const result = await service.validate(
      ORG_ID,
      baseCommand({
        customerNotes: 'Customer request',
        internalNotes: 'Ops note',
      }),
    );
    expect(result.notes).toContain('Customer request');
    expect(result.notes).toContain('[Internal]');
    expect(result.notes).toContain('Ops note');
  });
});
