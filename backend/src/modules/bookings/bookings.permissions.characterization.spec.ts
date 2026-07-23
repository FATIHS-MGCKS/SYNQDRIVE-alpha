import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import {
  BOOKING_PERMISSION_KEY,
} from './decorators/require-booking-permission.decorator';
import { BOOKING_PERMISSION_REQUIREMENTS } from './booking-permission.constants';
import { BookingPermissionsGuard } from './guards/booking-permissions.guard';
import { BookingsController } from './bookings.controller';

function bookingActionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(BOOKING_PERMISSION_KEY, handler);
}

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('BookingsController permissions characterization', () => {
  it('applies OrgScopingGuard, RolesGuard and BookingPermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BookingsController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, BookingPermissionsGuard]),
    );
  });

  const readHandlers = [
    'findTodaysPickups',
    'findTodaysReturns',
    'getStats',
    'findAll',
    'getWizardCheckoutContext',
    'getBookingRentalEligibility',
    'findDetail',
    'findOne',
  ] as const;

  it.each(readHandlers)('%s requires booking.read', (method) => {
    expect(bookingActionOf(BookingsController.prototype, method)).toBe('booking.read');
    expect(permissionOf(BookingsController.prototype, method)).toEqual({
      module: BOOKING_PERMISSION_REQUIREMENTS['booking.read'].module,
      level: BOOKING_PERMISSION_REQUIREMENTS['booking.read'].level,
    });
  });

  const mutationHandlers = [
    ['create', 'booking.create'],
    ['checkRentalEligibility', 'booking.create'],
    ['createWizardDraft', 'booking.create'],
    ['updateWizardDraft', 'booking.update'],
    ['confirmWizardDraft', 'booking.confirm'],
    ['abortWizardDraft', 'booking.cancel'],
    ['update', 'booking.update'],
    ['cancel', 'booking.cancel'],
    ['markNoShow', 'booking.mark_no_show'],
    ['addAllowedDriver', 'booking.update_customer'],
    ['setPrimaryDriver', 'booking.update_customer'],
    ['removeAllowedDriver', 'booking.update_customer'],
    ['createPickupHandover', 'booking.handover.perform'],
    ['createReturnHandover', 'booking.handover.perform'],
  ] as const;

  it.each(mutationHandlers)('%s requires %s', (method, action) => {
    expect(bookingActionOf(BookingsController.prototype, method)).toBe(action);
    expect(permissionOf(BookingsController.prototype, method)).toEqual({
      module: BOOKING_PERMISSION_REQUIREMENTS[action].module,
      level: BOOKING_PERMISSION_REQUIREMENTS[action].level,
    });
  });

  it.each([
    ['listAllowedDrivers', 'booking.read_sensitive'],
    ['getDriverConductHistory', 'booking.read_sensitive'],
    ['listHandovers', 'booking.handover.read'],
  ] as const)('%s requires %s', (method, action) => {
    expect(bookingActionOf(BookingsController.prototype, method)).toBe(action);
  });

  it('declares explicit booking permission on every public handler', () => {
    const handlerNames = [
      'findTodaysPickups',
      'findTodaysReturns',
      'getStats',
      'findAll',
      'checkRentalEligibility',
      'createWizardDraft',
      'updateWizardDraft',
      'getWizardCheckoutContext',
      'confirmWizardDraft',
      'abortWizardDraft',
      'getBookingRentalEligibility',
      'listAllowedDrivers',
      'addAllowedDriver',
      'setPrimaryDriver',
      'removeAllowedDriver',
      'getDriverConductHistory',
      'findDetail',
      'findOne',
      'create',
      'update',
      'cancel',
      'markNoShow',
      'listHandovers',
      'createPickupHandover',
      'createReturnHandover',
    ] as const;

    for (const method of handlerNames) {
      const action = bookingActionOf(BookingsController.prototype, method);
      expect(action).toBeDefined();
      expect(BOOKING_PERMISSION_REQUIREMENTS[action as keyof typeof BOOKING_PERMISSION_REQUIREMENTS]).toBeDefined();
    }
  });
});
