import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { MembershipRole } from '@prisma/client';
import { BookingsController } from './bookings.controller';
import {
  assertCanManageBookingDrivers,
  assertCanReadBookingDrivers,
} from './booking-allowed-drivers/booking-allowed-drivers.policy';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from './booking-eligibility-permission.constants';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('BookingsController permissions characterization', () => {
  it('applies guard stack at controller level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BookingsController) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['checkRentalEligibility', 'booking_eligibility.review'],
    ['getBookingRentalEligibility', 'booking_eligibility.review'],
  ] as const)('%s requires %s', (method, action) => {
    const requirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS[action];
    expect(permissionOf(BookingsController.prototype, method)).toEqual({
      module: requirement.module,
      level: requirement.level,
    });
  });

  it('documents eligibility override permission for manual approval', () => {
    const requirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.override'];
    expect(requirement.code).toBe('BOOKING_ELIGIBILITY_OVERRIDE');
  });

  it('maps driver read/manage roles consistently', () => {
    expect(() => assertCanReadBookingDrivers(MembershipRole.DRIVER)).not.toThrow();
    expect(() => assertCanManageBookingDrivers(MembershipRole.DRIVER)).toThrow();
    expect(() => assertCanManageBookingDrivers(MembershipRole.SUB_ADMIN)).not.toThrow();
  });
});
