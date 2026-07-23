import { BOOKING_PERMISSION_ACTIONS } from '@modules/bookings/booking-permission.constants';
import { PAYMENT_PERMISSION_ACTIONS } from '@modules/payments/payment-permission.constants';
import { SERVICE_CASE_PERMISSION_ACTIONS } from '@modules/service-cases/service-case-permission.constants';
import { TASK_PERMISSION_ACTIONS } from '@modules/tasks/task-permission.constants';
import { PERMISSION_MODULE_KEYS } from './permission.constants';
import {
  OPERATIONAL_PERMISSION_ACTIONS,
  OPERATIONAL_PERMISSION_REQUIREMENTS,
} from './operational-permission.registry';
import { evaluateOperationalPermission } from './operational-permission.util';
import { normalizeMembershipPermissions } from './permission.util';

describe('operational-permission.registry', () => {
  it('registers all booking, task and service case actions without duplicates', () => {
    const combined = [
      ...BOOKING_PERMISSION_ACTIONS,
      ...TASK_PERMISSION_ACTIONS,
      ...SERVICE_CASE_PERMISSION_ACTIONS,
    ];
    expect(OPERATIONAL_PERMISSION_ACTIONS).toEqual(combined);
    expect(new Set(OPERATIONAL_PERMISSION_ACTIONS).size).toBe(combined.length);
  });

  it('does not overlap with payment permission action keys', () => {
    const paymentSet = new Set<string>(PAYMENT_PERMISSION_ACTIONS);
    for (const action of OPERATIONAL_PERMISSION_ACTIONS) {
      expect(paymentSet.has(action)).toBe(false);
    }
  });

  it('maps every registered action to a known module requirement', () => {
    const moduleSet = new Set<string>(PERMISSION_MODULE_KEYS);
    for (const action of OPERATIONAL_PERMISSION_ACTIONS) {
      const requirement = OPERATIONAL_PERMISSION_REQUIREMENTS[action];
      expect(requirement).toBeDefined();
      expect(moduleSet.has(requirement.module)).toBe(true);
      expect(['read', 'write', 'manage']).toContain(requirement.level);
    }
  });

  it('uses booking.*, tasks.* and service_cases.* namespaces exclusively', () => {
    for (const action of BOOKING_PERMISSION_ACTIONS) {
      expect(action).toMatch(/^booking\./);
    }
    for (const action of TASK_PERMISSION_ACTIONS) {
      expect(action).toMatch(/^tasks\./);
    }
    for (const action of SERVICE_CASE_PERMISSION_ACTIONS) {
      expect(action).toMatch(/^service_cases\./);
    }
  });

  it('evaluates actions via backward-compatible module flags', () => {
    const perms = normalizeMembershipPermissions({
      bookings: { read: true, write: false, manage: false },
      tasks: { read: true, write: false, manage: false },
      'vendor-management': { read: true, write: true, manage: false },
    });

    expect(evaluateOperationalPermission(perms, 'booking.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.create')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'tasks.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.create')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'service_cases.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.create')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.manage_costs')).toBe(false);
  });
});
