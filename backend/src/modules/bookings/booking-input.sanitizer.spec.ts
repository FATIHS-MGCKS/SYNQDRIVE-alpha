import { toBookingCreateInput, toBookingUpdateInput } from './booking-input.sanitizer';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';

describe('booking-input.sanitizer', () => {
  it('maps create DTO to prisma connect shape without server-owned fields', () => {
    const dto = {
      vehicleId: '11111111-1111-4111-8111-111111111111',
      customerId: '22222222-2222-4222-8222-222222222222',
      startDate: '2026-08-01T10:00:00.000Z',
      endDate: '2026-08-05T10:00:00.000Z',
      quoteId: '33333333-3333-4333-8333-333333333333',
      status: 'CONFIRMED',
      notes: 'test',
      eligibilityApprovalId: '44444444-4444-4444-8444-444444444444',
      foreignTravelRequested: true,
      additionalDriverCount: 1,
    } as CreateBookingDto;

    const input = toBookingCreateInput(dto);
    expect(input).toMatchObject({
      quoteId: dto.quoteId,
      status: 'CONFIRMED',
      notes: 'test',
    });
    expect(input).not.toHaveProperty('paymentStatus');
    expect(input).not.toHaveProperty('cancelledAt');
    expect(input).not.toHaveProperty('organizationId');
    expect((input as { vehicle?: { connect?: { id?: string } } }).vehicle?.connect?.id).toBe(
      dto.vehicleId,
    );
  });

  it('maps update DTO without mass-assignment fields', () => {
    const dto = {
      notes: 'updated',
      status: 'CONFIRMED',
    } as UpdateBookingDto;

    const input = toBookingUpdateInput(dto);
    expect(input).toEqual({
      notes: 'updated',
      status: 'CONFIRMED',
    });
    expect(input).not.toHaveProperty('paymentStatus');
    expect(input).not.toHaveProperty('totalPriceCents');
  });
});
