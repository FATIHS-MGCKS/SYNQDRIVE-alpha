import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { mapCreateBookingDtoToCommand, mergeBookingNotesForStorage } from './booking-command.mapper';
import type { CreateBookingDto } from './dto/create-booking.dto';
import { BOOKING_CREATE_ERROR_CODES } from './booking-create-error.codes';

describe('mapCreateBookingDtoToCommand', () => {
  const baseDto: CreateBookingDto = {
    customerId: '11111111-1111-4111-8111-111111111111',
    vehicleId: '22222222-2222-4222-8222-222222222222',
    pickupAt: '2026-08-01T10:00:00.000Z',
    returnAt: '2026-08-05T10:00:00.000Z',
    pricingQuoteId: '33333333-3333-4333-8333-333333333333',
  };

  it('maps canonical fields to command', () => {
    const command = mapCreateBookingDtoToCommand(baseDto);
    expect(command.pickupAt.toISOString()).toBe('2026-08-01T10:00:00.000Z');
    expect(command.returnAt.toISOString()).toBe('2026-08-05T10:00:00.000Z');
    expect(command.pricingQuoteId).toBe(baseDto.pricingQuoteId);
  });

  it('accepts legacy aliases startDate/endDate/quoteId', () => {
    const command = mapCreateBookingDtoToCommand({
      ...baseDto,
      pickupAt: undefined,
      returnAt: undefined,
      pricingQuoteId: undefined,
      startDate: '2026-08-01T10:00:00.000Z',
      endDate: '2026-08-05T10:00:00.000Z',
      quoteId: '33333333-3333-4333-8333-333333333333',
    });
    expect(command.pricingQuoteId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('rejects conflicting pickupAt and startDate aliases', () => {
    expect(() =>
      mapCreateBookingDtoToCommand({
        ...baseDto,
        startDate: '2026-08-02T10:00:00.000Z',
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_CREATE_ERROR_CODES.BOOKING_CONFLICTING_DATE_ALIASES,
        }),
      }),
    );
  });

  it('rejects missing pickupAt/returnAt/pricingQuoteId', () => {
    expect(() =>
      mapCreateBookingDtoToCommand({
        customerId: '11111111-1111-4111-8111-111111111111',
        vehicleId: '22222222-2222-4222-8222-222222222222',
      } as CreateBookingDto),
    ).toThrow(BadRequestException);
  });
});

describe('mergeBookingNotesForStorage', () => {
  it('merges customer and internal notes', () => {
    expect(mergeBookingNotesForStorage('Hello', 'Secret')).toContain('[Internal]');
  });
});
