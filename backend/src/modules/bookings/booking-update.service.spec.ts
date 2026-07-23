import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingUpdateService } from './booking-update.service';
import { BOOKING_UPDATE_ERROR_CODES } from './booking-update-error.codes';

const ORG_ID = 'org-1';
const BOOKING_ID = 'booking-1';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID_2 = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID_2 = '44444444-4444-4444-8444-444444444444';
const DRIVER_ID = '55555555-5555-4555-8555-555555555555';
const UPDATED_AT = new Date('2026-07-23T12:00:00.000Z');

function baseBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    organizationId: ORG_ID,
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-05T10:00:00.000Z'),
    status: 'CONFIRMED',
    notes: null,
    pickupStationId: null,
    returnStationId: null,
    pickupAddressOverride: null,
    returnAddressOverride: null,
    isOneWayRental: false,
    totalPriceCents: 11900,
    dailyRateCents: 2500,
    currency: 'eur',
    kmIncluded: 800,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

type PrismaMock = {
  booking: {
    findFirst: jest.Mock;
    findFirstOrThrow: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  customer: { findFirst: jest.Mock; findMany: jest.Mock };
  vehicle: { findFirst: jest.Mock };
  station: { findMany: jest.Mock };
  pricingQuote: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock };
  bookingAllowedDriver: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

function buildService() {
  const prisma: PrismaMock = {
    booking: {
      findFirst: jest.fn().mockImplementation(async (args?: { select?: unknown }) => {
        if (args && 'select' in args) {
          return null;
        }
        return baseBooking();
      }),
      findFirstOrThrow: jest.fn().mockImplementation(() =>
        Promise.resolve(baseBooking({ updatedAt: new Date('2026-07-23T12:00:01.000Z') })),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(baseBooking()),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
      findMany: jest.fn().mockResolvedValue([{ id: DRIVER_ID }]),
    },
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: VEHICLE_ID }) },
    station: { findMany: jest.fn().mockResolvedValue([]) },
    pricingQuote: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    bookingAllowedDriver: { deleteMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: PrismaMock) => Promise<unknown>) =>
    fn(prisma),
  );

  const rentalHealthService = {
    isRentalBlocked: jest.fn().mockResolvedValue({
      blocked: false,
      healthGateStatus: 'OK',
      reasons: [],
    }),
  };
  const customerEligibilityService = {
    evaluateForBooking: jest.fn().mockResolvedValue({
      canCreatePendingBooking: true,
      canConfirmBooking: true,
    }),
  };
  const pricingService = {
    extractPricingInputFromBookingData: jest.fn().mockReturnValue({}),
    simulateBookingPrice: jest.fn().mockResolvedValue({
      rentalDays: 4,
      lineItems: [],
      subtotalNetCents: 10000,
      taxAmountCents: 1900,
      totalGrossCents: 11900,
      depositAmountCents: 50000,
      includedKm: 800,
      extraKmPriceCents: 25,
      totalDueNowCents: 11900,
      warnings: [],
      tariffVersionId: 'tv-1',
      priceBookId: 'pb-1',
      tariffGroupId: 'tg-1',
      currency: 'eur',
      effectiveDailyRateCents: 2500,
      pricingContext: {},
    }),
    legacyBookingFieldsFromSimulation: jest.fn().mockReturnValue({
      totalPriceCents: 11900,
      dailyRateCents: 2500,
      currency: 'eur',
    }),
    createBookingPriceSnapshotFromSimulation: jest.fn().mockResolvedValue({}),
  };
  const pricingQuoteService = {
    assertQuoteReadyForBooking: jest.fn(),
    decodeStoredQuote: jest.fn(),
    markConsumed: jest.fn(),
    releaseQuoteFromWizardDraft: jest.fn(),
  };
  const stationValidation = {
    validateBookingStations: jest.fn().mockResolvedValue({
      isOneWayRental: false,
      pickupStationId: 'station-1',
      returnStationId: 'station-2',
    }),
  };
  const bundleService = { regenerate: jest.fn() };
  const documentGenerationDispatcher = {
    enqueueInitialBundle: jest.fn().mockResolvedValue(undefined),
  };
  const invoicesService = { bootstrapBookingInvoice: jest.fn().mockResolvedValue(undefined) };
  const taskAutomationService = {
    ensureBookingLifecycleTasks: jest.fn().mockResolvedValue(undefined),
    syncBookingPreparationTiming: jest.fn().mockResolvedValue(undefined),
    syncBookingPickupTiming: jest.fn().mockResolvedValue(undefined),
    syncBookingReturnTiming: jest.fn().mockResolvedValue(undefined),
  };
  const vehicleCleaningTasks = { onBookingVehicleChanged: jest.fn().mockResolvedValue(undefined) };
  const fleetMapCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const rentalHealthSummaryCache = { invalidate: jest.fn().mockResolvedValue(undefined) };

  const service = new BookingUpdateService(
    prisma as never,
    rentalHealthService as never,
    customerEligibilityService as never,
    pricingService as never,
    pricingQuoteService as never,
    stationValidation as never,
    bundleService as never,
    documentGenerationDispatcher as never,
    invoicesService as never,
    taskAutomationService as never,
    vehicleCleaningTasks as never,
    fleetMapCache as never,
    rentalHealthSummaryCache as never,
  );

  return {
    service,
    prisma,
    pricingService,
    customerEligibilityService,
    rentalHealthService,
    invoicesService,
    bundleService,
    stationValidation,
  };
}

describe('BookingUpdateService', () => {
  describe('optimistic concurrency', () => {
    it('rejects stale expectedUpdatedAt with BOOKING_VERSION_CONFLICT', async () => {
      const { service } = buildService();
      await expect(
        service.updateNotes(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: new Date('2026-07-23T11:00:00.000Z'),
          customerNotes: 'New note',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
        }),
      });
    });

    it('rejects when updateMany count is zero (race)', async () => {
      const { service, prisma } = buildService();
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateNotes(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          customerNotes: 'Race note',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
        }),
      });
    });
  });

  describe('terminal state lock', () => {
    it('blocks terminal booking schedule changes without override', async () => {
      const { service, prisma } = buildService();
      prisma.booking.findFirst.mockResolvedValue(baseBooking({ status: 'COMPLETED' }));
      await expect(
        service.updateSchedule(
          ORG_ID,
          BOOKING_ID,
          {
            expectedUpdatedAt: UPDATED_AT,
            pickupAt: new Date('2026-08-02T10:00:00.000Z'),
          },
          { hasOverridePermission: false },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_TERMINAL_STATE_LOCKED,
        }),
      });
    });

    it('updates notes on terminal booking', async () => {
      const { service, prisma } = buildService();
      prisma.booking.findFirst.mockResolvedValue(baseBooking({ status: 'COMPLETED', notes: 'old' }));
      const result = await service.updateNotes(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        customerNotes: 'Terminal note',
      });
      expect(result).toBeDefined();
      expect(prisma.booking.updateMany).toHaveBeenCalled();
    });
  });

  describe('updateSchedule', () => {
    it('rejects unchanged schedule', async () => {
      const { service } = buildService();
      await expect(
        service.updateSchedule(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          pickupAt: new Date('2026-08-01T10:00:00.000Z'),
          returnAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_SCHEDULE_UNCHANGED,
        }),
      });
    });

    it('updates schedule and triggers pricing side effects', async () => {
      const { service, prisma, pricingService, invoicesService } = buildService();
      await service.updateSchedule(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        pickupAt: new Date('2026-08-02T10:00:00.000Z'),
      });
      expect(pricingService.simulateBookingPrice).toHaveBeenCalled();
      expect(pricingService.createBookingPriceSnapshotFromSimulation).toHaveBeenCalled();
      expect(invoicesService.bootstrapBookingInvoice).toHaveBeenCalled();
      expect(prisma.booking.updateMany).toHaveBeenCalled();
    });
  });

  describe('updateCustomer', () => {
    it('rejects unchanged customer', async () => {
      const { service } = buildService();
      await expect(
        service.updateCustomer(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          customerId: CUSTOMER_ID,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_CUSTOMER_UNCHANGED,
        }),
      });
    });

    it('re-checks customer eligibility on customer change', async () => {
      const { service, prisma, customerEligibilityService } = buildService();
      prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID_2 });
      await service.updateCustomer(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        customerId: CUSTOMER_ID_2,
      });
      expect(customerEligibilityService.evaluateForBooking).toHaveBeenCalledWith(
        ORG_ID,
        CUSTOMER_ID_2,
        expect.objectContaining({ requestedStatus: 'CONFIRMED' }),
      );
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: CUSTOMER_ID_2 }),
        }),
      );
    });
  });

  describe('updateVehicle', () => {
    it('rejects unchanged vehicle', async () => {
      const { service } = buildService();
      await expect(
        service.updateVehicle(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          vehicleId: VEHICLE_ID,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VEHICLE_UNCHANGED,
        }),
      });
    });

    it('checks rental health and overlap on vehicle change', async () => {
      const { service, prisma, rentalHealthService, pricingService } = buildService();
      prisma.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID_2 });
      await service.updateVehicle(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        vehicleId: VEHICLE_ID_2,
      });
      expect(rentalHealthService.isRentalBlocked).toHaveBeenCalledWith(ORG_ID, VEHICLE_ID_2);
      expect(pricingService.simulateBookingPrice).toHaveBeenCalled();
      expect(prisma.booking.updateMany).toHaveBeenCalled();
    });

    it('rejects vehicle overlap', async () => {
      const { service, prisma } = buildService();
      prisma.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID_2 });
      prisma.booking.findFirst.mockImplementation(async (args?: { select?: unknown }) => {
        if (args && 'select' in args) {
          return { id: 'other-booking', status: 'CONFIRMED' };
        }
        return baseBooking();
      });
      await expect(
        service.updateVehicle(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          vehicleId: VEHICLE_ID_2,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateStations', () => {
    it('rejects unchanged stations', async () => {
      const { service } = buildService();
      await expect(
        service.updateStations(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          pickupStationId: null,
          returnStationId: null,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_STATIONS_UNCHANGED,
        }),
      });
    });

    it('validates stations and persists changes', async () => {
      const { service, prisma, stationValidation } = buildService();
      await service.updateStations(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        pickupStationId: 'station-1',
        returnStationId: 'station-2',
      });
      expect(stationValidation.validateBookingStations).toHaveBeenCalled();
      expect(prisma.booking.updateMany).toHaveBeenCalled();
    });
  });

  describe('updateNotes', () => {
    it('rejects unchanged notes', async () => {
      const { service, prisma } = buildService();
      prisma.booking.findFirst.mockResolvedValue(baseBooking({ notes: 'same' }));
      await expect(
        service.updateNotes(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          customerNotes: 'same',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_NOTES_UNCHANGED,
        }),
      });
    });
  });

  describe('updateOptions', () => {
    it('recalculates pricing and snapshot on options change', async () => {
      const { service, pricingService, invoicesService } = buildService();
      await service.updateOptions(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        kmIncluded: 1200,
      });
      expect(pricingService.simulateBookingPrice).toHaveBeenCalled();
      expect(pricingService.createBookingPriceSnapshotFromSimulation).toHaveBeenCalled();
      expect(invoicesService.bootstrapBookingInvoice).toHaveBeenCalled();
    });
  });

  describe('updateAllowedDrivers', () => {
    it('rejects contract holder in allowedDriverIds', async () => {
      const { service } = buildService();
      await expect(
        service.updateAllowedDrivers(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          allowedDriverIds: [CUSTOMER_ID],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.ALLOWED_DRIVER_IS_CONTRACT_HOLDER,
        }),
      });
    });

    it('replaces allowed driver pool in transaction', async () => {
      const { service, prisma } = buildService();
      prisma.customer.findMany.mockResolvedValue([{ id: DRIVER_ID }]);
      await service.updateAllowedDrivers(ORG_ID, BOOKING_ID, {
        expectedUpdatedAt: UPDATED_AT,
        allowedDriverIds: [DRIVER_ID],
      });
      expect(prisma.bookingAllowedDriver.deleteMany).toHaveBeenCalled();
      expect(prisma.bookingAllowedDriver.createMany).toHaveBeenCalled();
    });

    it('rejects allowed drivers update on version conflict in transaction', async () => {
      const { service, prisma } = buildService();
      prisma.customer.findMany.mockResolvedValue([{ id: DRIVER_ID }]);
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateAllowedDrivers(ORG_ID, BOOKING_ID, {
          expectedUpdatedAt: UPDATED_AT,
          allowedDriverIds: [DRIVER_ID],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
        }),
      });
    });
  });
});
