import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';
import { UpdateBookingDto } from './update-booking.dto';
import { MarkBookingNoShowDto } from './mark-booking-no-show.dto';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';
const VALID_UUID_C = '33333333-3333-4333-8333-333333333333';
const VALID_UUID_D = '44444444-4444-4444-8444-444444444444';

async function validateDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const dto = plainToInstance(cls, plain);
  return validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

const validCreateBody = {
  customerId: VALID_UUID,
  vehicleId: VALID_UUID_B,
  pickupAt: '2026-08-01T10:00:00.000Z',
  returnAt: '2026-08-05T10:00:00.000Z',
  pricingQuoteId: VALID_UUID_C,
};

const validLegacyCreateBody = {
  customerId: VALID_UUID,
  vehicleId: VALID_UUID_B,
  startDate: '2026-08-01T10:00:00.000Z',
  endDate: '2026-08-05T10:00:00.000Z',
  quoteId: VALID_UUID_C,
};

describe('CreateBookingDto security validation', () => {
  it('accepts a valid flat create payload', async () => {
    const errors = await validateDto(CreateBookingDto, validCreateBody);
    expect(errors).toHaveLength(0);
  });

  it('accepts legacy alias fields', async () => {
    const errors = await validateDto(CreateBookingDto, validLegacyCreateBody);
    expect(errors).toHaveLength(0);
  });

  it('rejects client price hints', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      dailyRateCents: 5000,
      totalPriceCents: 20000,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate allowedDriverIds', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      allowedDriverIds: [VALID_UUID_D, VALID_UUID_D],
    });
    expect(errors.some((e) => e.property === 'allowedDriverIds')).toBe(true);
  });

  it('accepts paymentIntent and pricingInput selections', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      paymentIntent: 'invoice',
      pricingInput: {
        selectedMileagePackageId: VALID_UUID_D,
        selectedInsuranceOptionIds: [VALID_UUID_D],
        selectedExtraOptionIds: [VALID_UUID_D],
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown fields (forbidNonWhitelisted)', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      unexpectedField: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects nested Prisma relation payloads', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      customer: { connect: { id: VALID_UUID } },
      vehicle: { connect: { id: VALID_UUID_B } },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects manipulated organizationId', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      organizationId: VALID_UUID_D,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects disallowed lifecycle status values', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      status: 'COMPLETED',
    });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects internal lifecycle timestamps', async () => {
    for (const field of ['completedAt', 'cancelledAt', 'createdAt', 'updatedAt']) {
      const errors = await validateDto(CreateBookingDto, {
        ...validCreateBody,
        [field]: '2026-01-01T00:00:00.000Z',
      });
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects internal foreign keys', async () => {
    for (const field of ['invoiceId', 'priceSnapshotId', 'documentBundleId']) {
      const errors = await validateDto(CreateBookingDto, {
        ...validCreateBody,
        [field]: VALID_UUID_D,
      });
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects invalid UUID types', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      customerId: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'customerId')).toBe(true);
  });

  it('rejects overlong notes', async () => {
    const errors = await validateDto(CreateBookingDto, {
      ...validCreateBody,
      customerNotes: 'x'.repeat(8001),
    });
    expect(errors.some((e) => e.property === 'customerNotes')).toBe(true);
  });
});

describe('UpdateBookingDto security validation', () => {
  it('accepts a valid partial update payload', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      startDate: '2026-08-02T10:00:00.000Z',
      notes: 'Updated',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown fields', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      notes: 'ok',
      auditMetadata: { injected: true },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects nested vehicle connect payloads', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      vehicle: { connect: { id: VALID_UUID_B } },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects manipulated organizationId and cancelledBy', async () => {
    const orgErrors = await validateDto(UpdateBookingDto, {
      organizationId: VALID_UUID_D,
    });
    const cancelledByErrors = await validateDto(UpdateBookingDto, {
      cancelledBy: VALID_UUID,
    });
    expect(orgErrors.length).toBeGreaterThan(0);
    expect(cancelledByErrors.length).toBeGreaterThan(0);
  });

  it('rejects terminal status manipulation via PATCH', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      status: 'CANCELLED',
    });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects invalid date types', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      startDate: 'not-a-date',
    });
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('rejects overlong notes', async () => {
    const errors = await validateDto(UpdateBookingDto, {
      notes: 'n'.repeat(8001),
    });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});

describe('MarkBookingNoShowDto validation', () => {
  it('accepts optional reason', async () => {
    const errors = await validateDto(MarkBookingNoShowDto, { reason: 'Customer absent' });
    expect(errors).toHaveLength(0);
  });

  it('rejects overlong reason', async () => {
    const errors = await validateDto(MarkBookingNoShowDto, {
      reason: 'r'.repeat(2001),
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });
});
