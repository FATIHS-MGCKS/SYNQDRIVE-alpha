import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBookingScheduleDto } from './update-booking-schedule.dto';
import { UpdateBookingNotesDto } from './update-booking-notes.dto';
import { UpdateBookingAllowedDriversDto } from './update-booking-allowed-drivers.dto';

async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('Booking update DTOs', () => {
  it('UpdateBookingScheduleDto requires expectedUpdatedAt', async () => {
    const errors = await validateDto(UpdateBookingScheduleDto, {
      startDate: '2026-08-01T10:00:00.000Z',
    });
    expect(errors.some((e) => e.property === 'expectedUpdatedAt')).toBe(true);
  });

  it('UpdateBookingScheduleDto rejects status field', async () => {
    const errors = await validateDto(UpdateBookingScheduleDto, {
      expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
      startDate: '2026-08-01T10:00:00.000Z',
      status: 'CANCELLED',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('UpdateBookingNotesDto rejects client price fields', async () => {
    const errors = await validateDto(UpdateBookingNotesDto, {
      expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
      customerNotes: 'ok',
      totalPriceCents: 1000,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('UpdateBookingAllowedDriversDto enforces unique driver ids', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const errors = await validateDto(UpdateBookingAllowedDriversDto, {
      expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
      allowedDriverIds: [id, id],
    });
    expect(errors.some((e) => e.property === 'allowedDriverIds')).toBe(true);
  });
});
