import { ConflictException, NotFoundException } from '@nestjs/common';
import { HandoverKind } from '@prisma/client';
import { BookingHandoverDraftService } from './booking-handover-draft.service';

const ORG_ID = 'org-1';
const BOOKING_ID = 'booking-1';
const USER_ID = 'user-1';

describe('BookingHandoverDraftService', () => {
  let prisma: {
    booking: { findFirst: jest.Mock };
    bookingHandoverDraft: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let stationAccess: {
    resolve: jest.Mock;
    assertStationReadable: jest.Mock;
  };
  let service: BookingHandoverDraftService;

  beforeEach(() => {
    prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: BOOKING_ID,
          pickupStationId: 'station-pickup',
          returnStationId: 'station-return',
        }),
      },
      bookingHandoverDraft: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    stationAccess = {
      resolve: jest.fn().mockResolvedValue({ bypassScope: true }),
      assertStationReadable: jest.fn(),
    };
    service = new BookingHandoverDraftService(prisma as never, stationAccess as never);
  });

  it('returns null when no draft exists', async () => {
    prisma.bookingHandoverDraft.findFirst.mockResolvedValue(null);
    const result = await service.getDraft(ORG_ID, BOOKING_ID, HandoverKind.PICKUP, USER_ID);
    expect(result).toBeNull();
  });

  it('creates a draft when none exists', async () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    prisma.bookingHandoverDraft.findFirst.mockResolvedValue(null);
    prisma.bookingHandoverDraft.create.mockResolvedValue({
      id: 'draft-1',
      bookingId: BOOKING_ID,
      kind: HandoverKind.RETURN,
      userId: USER_ID,
      payload: { odometerKm: '15000' },
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.upsertDraft(
      ORG_ID,
      BOOKING_ID,
      HandoverKind.RETURN,
      USER_ID,
      { odometerKm: '15000' },
    );

    expect(result.payload).toEqual({ odometerKm: '15000' });
    expect(prisma.bookingHandoverDraft.create).toHaveBeenCalled();
  });

  it('throws conflict when expectedUpdatedAt is stale', async () => {
    const existingUpdatedAt = new Date('2026-07-25T12:00:00.000Z');
    prisma.bookingHandoverDraft.findFirst.mockResolvedValue({
      id: 'draft-1',
      updatedAt: existingUpdatedAt,
    });

    await expect(
      service.upsertDraft(
        ORG_ID,
        BOOKING_ID,
        HandoverKind.PICKUP,
        USER_ID,
        { note: 'stale' },
        '2026-07-25T11:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when booking is missing', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      service.getDraft(ORG_ID, BOOKING_ID, HandoverKind.PICKUP, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes drafts for booking after completion', async () => {
    await service.deleteDraftsForBooking(ORG_ID, BOOKING_ID);
    expect(prisma.bookingHandoverDraft.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, bookingId: BOOKING_ID },
    });
  });
});
