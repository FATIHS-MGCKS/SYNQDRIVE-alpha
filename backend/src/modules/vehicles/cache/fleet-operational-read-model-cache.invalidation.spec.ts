import { ConflictException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { BookingsHandoverService } from '@modules/bookings/bookings-handover.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { FleetOperationalReadModelCacheService } from './fleet-operational-read-model-cache.service';
import {
  fleetMapCacheKey,
  vehicleOperationalCacheKey,
} from './fleet-operational-read-model-cache.keys';

const ORG_ID = 'org-1';
const BOOKING_ID = 'bk-1';
const VEHICLE_ID = 'veh-1';
const OTHER_VEHICLE_ID = 'veh-2';

function makeHandoverService(deps: {
  prisma: Record<string, unknown>;
  fleetOperationalCache: FleetOperationalReadModelCacheService;
}) {
  const bookingDocumentBundleService = {
    generatePickupProtocolDocument: jest.fn().mockResolvedValue(undefined),
    generateReturnProtocolDocument: jest.fn().mockResolvedValue(undefined),
    generateFinalInvoiceAndDocument: jest.fn().mockResolvedValue(undefined),
  };
  return new BookingsHandoverService(
    deps.prisma as any,
    bookingDocumentBundleService as any,
    { scheduleEmit: jest.fn() } as any,
    {
      applyHandoverPickup: jest.fn().mockResolvedValue({ changed: true }),
      applyHandoverReturn: jest.fn().mockResolvedValue({ changed: true }),
    } as any,
    deps.fleetOperationalCache,
  );
}

function makeBookingHandoverMocks(vehicleStatus: VehicleStatus = VehicleStatus.AVAILABLE) {
  const protocolRow = {
    id: 'proto-1',
    bookingId: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    kind: 'PICKUP' as const,
    performedAt: new Date('2026-07-15T10:00:00.000Z'),
    performedByUserId: null,
    performedByName: null,
    odometerKm: 1000,
    fuelPercent: 80,
    fuelFull: false,
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    warningLightsNotes: null,
    notes: null,
    customerSignatureName: null,
    customerSignatureDataUrl: null,
    staffSignatureName: null,
    staffSignatureDataUrl: null,
    documentsAcknowledged: false,
    damageIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tx = {
    bookingHandoverProtocol: {
      create: jest.fn().mockResolvedValue(protocolRow),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    booking: {
      update: jest.fn().mockResolvedValue({
        id: BOOKING_ID,
        status: 'ACTIVE',
        vehicleId: VEHICLE_ID,
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ status: vehicleStatus }),
    },
    vehicleDamage: { updateMany: jest.fn() },
    vehicleComplaint: { create: jest.fn() },
  };

  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue({
        id: BOOKING_ID,
        vehicleId: VEHICLE_ID,
        customerId: 'cust-1',
        status: 'CONFIRMED',
        startDate: new Date('2026-07-15T08:00:00.000Z'),
        pickupStationId: 'st-1',
        returnStationId: 'st-1',
      }),
    },
    bookingHandoverProtocol: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { prisma, tx, protocolRow };
}

describe('Fleet operational cache invalidation wiring', () => {
  let fleetOperationalCache: FleetOperationalReadModelCacheService;
  let invalidateSpy: jest.SpyInstance;

  beforeEach(() => {
    fleetOperationalCache = new FleetOperationalReadModelCacheService({
      del: jest.fn().mockResolvedValue(1),
    } as any);
    invalidateSpy = jest.spyOn(fleetOperationalCache, 'invalidateVehicles');
  });

  describe('BookingsHandoverService', () => {
    it('pickup invalidates fleet and vehicle detail keys', async () => {
      const { prisma } = makeBookingHandoverMocks();
      const service = makeHandoverService({ prisma, fleetOperationalCache });

      await service.createHandover(ORG_ID, BOOKING_ID, 'PICKUP', {
        odometerKm: 1000,
        fuelPercent: 80,
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        vehicleIds: [VEHICLE_ID],
      });
    });

    it('return invalidates fleet and vehicle detail keys', async () => {
      const { prisma, tx } = makeBookingHandoverMocks();
      prisma.booking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        vehicleId: VEHICLE_ID,
        customerId: 'cust-1',
        status: 'ACTIVE',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        pickupStationId: 'st-1',
        returnStationId: 'st-1',
      });
      tx.booking.update.mockResolvedValue({
        id: BOOKING_ID,
        status: 'COMPLETED',
        vehicleId: VEHICLE_ID,
      });
      tx.bookingHandoverProtocol.findUnique.mockResolvedValue({
        odometerKm: 1000,
      });
      const service = makeHandoverService({ prisma, fleetOperationalCache });

      await service.createHandover(ORG_ID, BOOKING_ID, 'RETURN', {
        odometerKm: 1500,
        fuelPercent: 70,
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        vehicleIds: [VEHICLE_ID],
      });
    });

    it('failed pickup transaction does not invalidate', async () => {
      const { prisma } = makeBookingHandoverMocks(VehicleStatus.IN_SERVICE);
      const service = makeHandoverService({ prisma, fleetOperationalCache });

      await expect(
        service.createHandover(ORG_ID, BOOKING_ID, 'PICKUP', {
          odometerKm: 1000,
          fuelPercent: 80,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('BookingsService', () => {
    const rentalHealthService = {
      isRentalBlocked: jest.fn().mockResolvedValue({
        healthGateStatus: 'AVAILABLE',
        blocked: false,
        reasons: [],
        healthGateWarning: null,
        manualReviewRequired: false,
      }),
    };
    const customerEligibilityService = {
      evaluateForBooking: jest.fn().mockResolvedValue({
        canCreateBooking: true,
        canConfirmBooking: true,
        canStartRental: true,
        stages: {
          createBooking: { blockingReasons: [] },
          confirmBooking: { blockingReasons: [] },
          startPickup: { blockingReasons: [] },
        },
        warnings: [],
        requiredActions: [],
      }),
    };

    function makeBookingsService(prismaOverrides: Record<string, unknown> = {}) {
      const prisma = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          findFirstOrThrow: jest.fn(),
          update: jest.fn(),
          count: jest.fn(),
        },
        $transaction: jest.fn(),
        ...prismaOverrides,
      };

      return {
        service: new BookingsService(
          prisma as any,
          { generateForBooking: jest.fn() } as any,
          {} as any,
          rentalHealthService as any,
          {} as any,
          { voidAllForBooking: jest.fn().mockResolvedValue(undefined) } as any,
          {} as any,
          { ensureBookingLifecycleTasks: jest.fn() } as any,
          customerEligibilityService as any,
          {
            extractPricingInputFromBookingData: jest.fn(),
            legacyBookingFieldsFromSimulation: jest.fn(),
            simulateBookingPrice: jest.fn(),
            createBookingPriceSnapshot: jest.fn(),
          } as any,
          { consumeForBooking: jest.fn(), findConsumedBookingId: jest.fn(), markConsumed: jest.fn() } as any,
          { validateStationAssignment: jest.fn() } as any,
          {} as any,
          { applyBookingLifecycleRelease: jest.fn() } as any,
          fleetOperationalCache,
          { findOne: jest.fn() } as any,
        ),
        prisma,
      };
    }

    it('cancel invalidates after successful transaction', async () => {
      const { service, prisma } = makeBookingsService();
      prisma.booking.findFirstOrThrow.mockResolvedValue({
        id: BOOKING_ID,
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
      });
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          booking: {
            update: jest.fn().mockResolvedValue({ id: BOOKING_ID, vehicleId: VEHICLE_ID }),
          },
        }),
      );

      await service.cancel(ORG_ID, BOOKING_ID);

      expect(invalidateSpy).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        vehicleIds: [VEHICLE_ID],
      });
    });

    it('booking reschedule invalidates affected vehicle', async () => {
      const { service, prisma } = makeBookingsService();
      const existingStart = new Date('2026-07-15T08:00:00.000Z');
      const existingEnd = new Date('2026-07-20T18:00:00.000Z');
      prisma.booking.findFirstOrThrow.mockResolvedValue({
        id: BOOKING_ID,
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        customerId: 'cust-1',
        status: 'CONFIRMED',
        startDate: existingStart,
        endDate: existingEnd,
      });
      prisma.booking.update.mockResolvedValue({
        id: BOOKING_ID,
        vehicleId: VEHICLE_ID,
        status: 'CONFIRMED',
        startDate: new Date('2026-07-16T08:00:00.000Z'),
        endDate: existingEnd,
      });

      await service.update(ORG_ID, BOOKING_ID, {
        startDate: new Date('2026-07-16T08:00:00.000Z'),
      } as any);

      expect(invalidateSpy).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        vehicleIds: [VEHICLE_ID],
      });
    });

    it('vehicle swap invalidates both old and new vehicles', async () => {
      const { service, prisma } = makeBookingsService();
      const start = new Date('2026-07-15T08:00:00.000Z');
      const end = new Date('2026-07-20T18:00:00.000Z');
      prisma.booking.findFirstOrThrow.mockResolvedValue({
        id: BOOKING_ID,
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        customerId: 'cust-1',
        status: 'CONFIRMED',
        startDate: start,
        endDate: end,
      });
      prisma.booking.update.mockResolvedValue({
        id: BOOKING_ID,
        vehicleId: OTHER_VEHICLE_ID,
        status: 'CONFIRMED',
        startDate: start,
        endDate: end,
      });

      await service.update(ORG_ID, BOOKING_ID, {
        vehicleId: OTHER_VEHICLE_ID,
      } as any);

      expect(invalidateSpy).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        vehicleIds: [VEHICLE_ID, OTHER_VEHICLE_ID],
      });
    });
  });

  describe('redis key contract', () => {
    it('fleet and vehicle detail keys are distinct', () => {
      expect(fleetMapCacheKey(ORG_ID)).not.toBe(
        vehicleOperationalCacheKey(ORG_ID, VEHICLE_ID),
      );
    });
  });
});
