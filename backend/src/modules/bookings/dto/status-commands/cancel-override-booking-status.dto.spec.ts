import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CancelBookingStatusCommandDto } from './cancel-booking-status-command.dto';
import { AdminOverrideBookingStatusDto } from './admin-override-booking-status.dto';

async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  return validate(dto);
}

describe('CancelBookingStatusCommandDto', () => {
  it('requires reasonCode', async () => {
    const errors = await validateDto(CancelBookingStatusCommandDto, {});
    expect(errors.some((e) => e.property === 'reasonCode')).toBe(true);
  });

  it('accepts valid cancellation payload', async () => {
    const errors = await validateDto(CancelBookingStatusCommandDto, {
      reasonCode: 'CUSTOMER_REQUEST',
      description: 'Customer called to cancel',
      effectiveAt: '2026-01-01T10:00:00.000Z',
    });
    expect(errors).toHaveLength(0);
  });
});

describe('AdminOverrideBookingStatusDto', () => {
  it('requires min 10 char reason', async () => {
    const errors = await validateDto(AdminOverrideBookingStatusDto, {
      toStatus: 'CONFIRMED',
      reason: 'short',
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('accepts optional approvalRequestId for four-eyes prep', async () => {
    const errors = await validateDto(AdminOverrideBookingStatusDto, {
      toStatus: 'CONFIRMED',
      reason: 'Approved workflow override after review',
      approvalRequestId: '550e8400-e29b-41d4-a716-446655440000',
      affectedInvariants: ['STATUS_MACHINE_BYPASS'],
    });
    expect(errors).toHaveLength(0);
  });
});
