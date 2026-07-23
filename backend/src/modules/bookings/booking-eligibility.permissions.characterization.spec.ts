import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from './booking-eligibility-permission.constants';
import { BookingsController } from './bookings.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('BookingsController rental eligibility permissions characterization', () => {
  it('applies PermissionsGuard at controller level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BookingsController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
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

  it('documents override permission mapping for future manual-approval endpoint', () => {
    const requirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.override'];
    expect(requirement).toEqual({
      module: 'booking-eligibility-override',
      level: 'manage',
      code: 'BOOKING_ELIGIBILITY_OVERRIDE',
    });
  });
});
