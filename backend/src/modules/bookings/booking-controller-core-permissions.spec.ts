import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { BookingsController } from './bookings.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('BookingsController core booking permissions', () => {
  it.each([
    ['findAll', 'read'],
    ['findTodaysPickups', 'read'],
    ['findTodaysReturns', 'read'],
    ['getStats', 'read'],
    ['findOne', 'read'],
    ['findDetail', 'read'],
    ['listHandovers', 'read'],
  ] as const)('%s requires bookings.%s', (method, level) => {
    expect(permissionOf(BookingsController.prototype, method)).toEqual({
      module: 'bookings',
      level,
    });
  });

  it.each([
    ['create', 'write'],
    ['update', 'write'],
    ['markNoShow', 'write'],
    ['createPickupHandover', 'write'],
    ['createReturnHandover', 'write'],
  ] as const)('%s requires bookings.%s', (method, level) => {
    expect(permissionOf(BookingsController.prototype, method)).toEqual({
      module: 'bookings',
      level,
    });
  });

  it('cancel requires bookings.manage', () => {
    expect(permissionOf(BookingsController.prototype, 'cancel')).toEqual({
      module: 'bookings',
      level: 'manage',
    });
  });
});
