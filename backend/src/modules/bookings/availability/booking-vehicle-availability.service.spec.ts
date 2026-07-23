import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BookingVehicleAvailabilityService } from './booking-vehicle-availability.service';
import {
  BOOKING_AVAILABILITY_ERROR_CODES,
  PG_EXCLUSION_VIOLATION,
} from './booking-availability.constants';

describe('BookingVehicleAvailabilityService', () => {
  const prisma = {} as never;
  const service = new BookingVehicleAvailabilityService(prisma);

  describe('buildConflictException', () => {
    it('returns stable BOOKING_CONFLICT code', () => {
      const err = service.buildConflictException({
        bookingId: 'bk-1',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
        status: 'CONFIRMED',
        turnaroundBufferMinutes: 60,
      });

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        code: BOOKING_AVAILABILITY_ERROR_CODES.BOOKING_CONFLICT,
        conflictingBookingId: 'bk-1',
      });
    });
  });

  describe('isAvailabilityExclusionViolation', () => {
    it('detects Prisma known error with PG 23P01 meta', () => {
      const error = new Prisma.PrismaClientKnownRequestError('exclusion', {
        code: 'P2010',
        clientVersion: '5.20.0',
        meta: { database_error_code: PG_EXCLUSION_VIOLATION },
      });
      expect(service.isAvailabilityExclusionViolation(error)).toBe(true);
    });

    it('detects driver code 23P01', () => {
      expect(service.isAvailabilityExclusionViolation({ code: PG_EXCLUSION_VIOLATION })).toBe(
        true,
      );
    });

    it('returns false for unrelated errors', () => {
      expect(service.isAvailabilityExclusionViolation(new Error('other'))).toBe(false);
    });
  });

  describe('isBlockingStatus', () => {
    it('treats PENDING, CONFIRMED, ACTIVE as blocking', () => {
      expect(service.isBlockingStatus('PENDING')).toBe(true);
      expect(service.isBlockingStatus('CONFIRMED')).toBe(true);
      expect(service.isBlockingStatus('ACTIVE')).toBe(true);
    });

    it('does not block CANCELLED, NO_SHOW, COMPLETED', () => {
      expect(service.isBlockingStatus('CANCELLED')).toBe(false);
      expect(service.isBlockingStatus('NO_SHOW')).toBe(false);
      expect(service.isBlockingStatus('COMPLETED')).toBe(false);
    });
  });
});
