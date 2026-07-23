import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatusCommandService } from './booking-status-command.service';
import { BookingStatusIdempotencyKeyRequiredError } from './booking-status-command.errors';
import { BOOKING_STATE_MACHINE_ERROR_CODES } from '../state-machine/booking-state-machine-error.codes';

function baseBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    status: 'PENDING',
    startDate: new Date('2020-01-01T10:00:00.000Z'),
    endDate: new Date('2020-01-05T10:00:00.000Z'),
    pickupStationId: null,
    returnStationId: null,
    notes: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('BookingStatusCommandService', () => {
  const prisma = {
    bookingStatusCommand: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    bookingHandoverProtocol: {
      findUnique: jest.fn(),
    },
    vehicle: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const statusTransition = {
    planTransition: jest.fn(),
    buildUpdateData: jest.fn((to: string) => ({ status: to })),
    commitTransitionEffects: jest.fn(),
  };

  const dispatcher = {
    enqueueInitialBundle: jest.fn(() => Promise.resolve()),
  };
  const legalEmail = {
    maybeAutoSendFrozenBookingDocuments: jest.fn(() => Promise.resolve()),
  };

  const service = new BookingStatusCommandService(
    prisma as never,
    statusTransition as never,
    { voidAllForBooking: jest.fn(() => Promise.resolve()) } as never,
    dispatcher as never,
    legalEmail as never,
    {
      supersedeBookingLifecycleOnCancellation: jest.fn(() => Promise.resolve()),
      handleBookingNoShow: jest.fn(() => Promise.resolve()),
      ensureBookingLifecycleTasks: jest.fn(() => Promise.resolve()),
    } as never,
    { onBookingCancelled: jest.fn(() => Promise.resolve()) } as never,
    { invalidate: jest.fn(() => Promise.resolve()) } as never,
    { invalidate: jest.fn(() => Promise.resolve()) } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.bookingStatusCommand.findUnique.mockResolvedValue(null);
    prisma.bookingStatusCommand.create.mockResolvedValue({});
    prisma.$executeRaw.mockResolvedValue(undefined);
    statusTransition.planTransition.mockImplementation(({ from, to, trigger }) => ({
      definition: {
        key: 'confirm',
        from,
        to,
        trigger,
        permission: 'booking.confirm',
        reasonCode: 'BOOKING_CONFIRMED',
        terminal: false,
        workflowEventType: 'booking.confirmed',
      },
      from,
      to,
    }));
  });

  function mockTransaction(booking: ReturnType<typeof baseBooking>) {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        ...prisma,
        booking: {
          findFirst: jest.fn().mockResolvedValue(booking),
          update: jest.fn().mockImplementation(async ({ data }) => ({
            ...booking,
            ...data,
            status: data.status ?? booking.status,
          })),
        },
        bookingStatusCommand: prisma.bookingStatusCommand,
        bookingHandoverProtocol: prisma.bookingHandoverProtocol,
        vehicle: prisma.vehicle,
        $executeRaw: prisma.$executeRaw,
      };
      tx.vehicle.updateMany.mockResolvedValue({ count: 1 });
      const out = await fn(tx as never);
      if (out && typeof out === 'object' && 'commandResult' in out) {
        return out;
      }
      return { commandResult: out, plannedForEffects: null };
    });
  }

  const baseInput = {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    idempotencyKey: 'cmd:cancel:bk-1:abc',
    actor: { userId: 'user-1', displayName: 'Tester' },
  };

  it('requires idempotency key', async () => {
    await expect(
      service.execute({ ...baseInput, command: 'CANCEL', idempotencyKey: '' }),
    ).rejects.toBeInstanceOf(BookingStatusIdempotencyKeyRequiredError);
  });

  it('replays stored command for duplicate idempotency key', async () => {
    const stored = {
      booking: baseBooking({ status: 'CANCELLED' }),
      transition: {
        command: 'CANCEL',
        from: 'CONFIRMED',
        to: 'CANCELLED',
        trigger: 'cancel',
        reasonCode: 'BOOKING_CANCELLED',
        idempotent: false,
        replayed: false,
      },
    };
    prisma.bookingStatusCommand.findUnique.mockResolvedValue({
      bookingId: 'bk-1',
      commandType: 'CANCEL',
      resultPayload: {
        booking: {
          ...stored.booking,
          startDate: stored.booking.startDate.toISOString(),
          endDate: stored.booking.endDate.toISOString(),
          updatedAt: stored.booking.updatedAt.toISOString(),
          cancelledAt: null,
          completedAt: null,
        },
        transition: stored.transition,
      },
    });

    const result = await service.execute({ ...baseInput, command: 'CANCEL' });
    expect(result.transition.replayed).toBe(true);
    expect(result.booking.status).toBe('CANCELLED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cancels from CONFIRMED', async () => {
    mockTransaction(baseBooking({ status: 'CONFIRMED' }));
    const result = await service.execute({ ...baseInput, command: 'CANCEL' });
    expect(result.booking.status).toBe('CANCELLED');
    expect(result.transition.idempotent).toBe(false);
    expect(statusTransition.commitTransitionEffects).toHaveBeenCalled();
  });

  it('returns idempotent success when already CANCELLED', async () => {
    mockTransaction(baseBooking({ status: 'CANCELLED' }));
    const result = await service.execute({ ...baseInput, command: 'CANCEL' });
    expect(result.transition.idempotent).toBe(true);
    expect(statusTransition.commitTransitionEffects).not.toHaveBeenCalled();
  });

  it('rejects cancel from COMPLETED terminal state', async () => {
    mockTransaction(baseBooking({ status: 'COMPLETED' }));
    statusTransition.planTransition.mockImplementation(() => {
      throw new ConflictException({
        code: BOOKING_STATE_MACHINE_ERROR_CODES.TRANSITION_NOT_ALLOWED,
      });
    });
    await expect(service.execute({ ...baseInput, command: 'CANCEL' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confirms PENDING → CONFIRMED', async () => {
    mockTransaction(baseBooking({ status: 'PENDING' }));
    const result = await service.execute({
      ...baseInput,
      command: 'CONFIRM',
      idempotencyKey: 'cmd:confirm:bk-1:abc',
    });
    expect(result.booking.status).toBe('CONFIRMED');
  });

  it('rejects no-show before pickup time', async () => {
    mockTransaction(
      baseBooking({
        status: 'CONFIRMED',
        startDate: new Date(Date.now() + 86_400_000),
      }),
    );
    statusTransition.planTransition.mockImplementation(() => {
      throw new ConflictException({ code: BOOKING_STATE_MACHINE_ERROR_CODES.TRANSITION_NOT_ALLOWED });
    });
    await expect(
      service.execute({
        ...baseInput,
        command: 'MARK_NO_SHOW',
        idempotencyKey: 'cmd:no-show:bk-1:abc',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects foreign booking (not found)', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        ...prisma,
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingStatusCommand: prisma.bookingStatusCommand,
        $executeRaw: prisma.$executeRaw,
      };
      return fn(tx as never);
    });
    await expect(service.execute({ ...baseInput, command: 'CANCEL' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects idempotency key reused for different booking', async () => {
    prisma.bookingStatusCommand.findUnique.mockResolvedValue({
      bookingId: 'other-booking',
      commandType: 'CANCEL',
      resultPayload: {},
    });
    await expect(service.execute({ ...baseInput, command: 'CANCEL' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BOOKING_STATUS_IDEMPOTENCY_KEY_CONFLICT' }),
    });
  });
});
