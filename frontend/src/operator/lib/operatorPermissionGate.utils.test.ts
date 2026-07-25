import { describe, expect, it } from 'vitest';
import {
  mergeOperatorGates,
  operatorSheetPermission,
  permissionGate,
} from './operatorPermissionGate.utils';

describe('operatorPermissionGate.utils', () => {
  it('merges gates with first denial winning', () => {
    expect(
      mergeOperatorGates(
        { allowed: true },
        { allowed: false, reason: 'Denied' },
        { allowed: true },
      ),
    ).toEqual({ allowed: false, reason: 'Denied' });
  });

  it('maps sheet actions to operator permissions', () => {
    expect(operatorSheetPermission({ type: 'booking-create' })).toBe('operator.booking.create');
    expect(operatorSheetPermission({ type: 'tire-measure', vehicleId: 'v1', vehicleLabel: 'X' })).toBe(
      'operator.tire_measurement.create',
    );
  });

  it('builds permission gates', () => {
    expect(permissionGate(true, 'nope')).toEqual({ allowed: true });
    expect(permissionGate(false, 'nope')).toEqual({ allowed: false, reason: 'nope' });
  });
});
