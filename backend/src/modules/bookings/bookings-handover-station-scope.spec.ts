import { NotFoundException } from '@nestjs/common';
import { BookingsHandoverService } from './bookings-handover.service';

// Re-use harness from main spec file pattern
const actor = {
  userId: 'user-operator-1',
  displayName: 'Field Operator',
  membershipRole: 'WORKER',
};

describe('BookingsHandoverService station scope', () => {
  it('rejects pickup when actual station is not readable', async () => {
    const stationAccess = {
      resolve: jest.fn().mockResolvedValue({
        bypassScope: false,
        allowedStationIds: ['station-other'],
        membershipRole: 'WORKER',
        userId: actor.userId,
      }),
      assertStationReadable: jest.fn(() => {
        throw new NotFoundException('Station station-pickup not found');
      }),
    };

    const prisma = {
      bookingHandoverProtocol: { findUnique: jest.fn().mockResolvedValue(null) },
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'bk-1',
          vehicleId: 'veh-1',
          customerId: 'cust-1',
          status: 'CONFIRMED',
          startDate: new Date(),
          endDate: new Date(),
          pickupStationId: 'station-pickup',
          returnStationId: 'station-return',
        }),
      },
    };

    const svc = new BookingsHandoverService(
      prisma as never,
      { enqueuePickupProtocol: jest.fn() } as never,
      { scheduleEmit: jest.fn() } as never,
      { onPickupHandoverCompleted: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { assertPickupAllowed: jest.fn() } as never,
      { appendInTransaction: jest.fn() } as never,
      { assertAllowedForPickup: jest.fn() } as never,
      { processPickupPrecheck: jest.fn() } as never,
      stationAccess as never,
      { deleteDraftsForBooking: jest.fn() } as never,
    );

    await expect(
      svc.createHandover(
        'org-1',
        'bk-1',
        'PICKUP',
        {
          odometerKm: 1000,
          fuelPercent: 50,
          customerSignatureName: 'A',
          customerSignatureDataUrl: 'data:image/png;base64,x',
          staffSignatureName: 'B',
          staffSignatureDataUrl: 'data:image/png;base64,y',
          actualStationId: 'station-pickup',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
