import { describe, expect, it } from 'vitest';
import { evaluateOperatorPermission } from './operatorPermissions';

describe('operatorPermissions', () => {
  const fieldAgentPerms = {
    'operator-app': { read: true, write: true, manage: false },
    bookings: { read: true, write: true, manage: false },
    fleet: { read: true, write: true, manage: false },
    tasks: { read: true, write: true, manage: false },
    'fleet-condition': { read: true, write: true, manage: false },
    'document-upload': { read: true, write: true, manage: false },
    'booking-eligibility-override': { read: true, write: false, manage: true },
  };

  it('allows field agent handover when fieldAgentAccess is set', () => {
    expect(
      evaluateOperatorPermission(fieldAgentPerms, 'operator.handover.complete', {
        fieldAgentAccess: true,
      }),
    ).toBe(true);
  });

  it('denies handover without fieldAgentAccess flag', () => {
    expect(
      evaluateOperatorPermission(fieldAgentPerms, 'operator.handover.complete', {
        fieldAgentAccess: false,
      }),
    ).toBe(false);
  });

  it('denies employee baseline from handover writes', () => {
    const employeePerms = {
      'operator-app': { read: true, write: false, manage: false },
      bookings: { read: true, write: false, manage: false },
    };
    expect(evaluateOperatorPermission(employeePerms, 'operator.handover.complete')).toBe(false);
    expect(evaluateOperatorPermission(employeePerms, 'operator.app.access')).toBe(true);
  });

  it('bypasses checks for ORG_ADMIN membership role', () => {
    expect(
      evaluateOperatorPermission(null, 'operator.booking.cancel', {
        membershipRole: 'ORG_ADMIN',
      }),
    ).toBe(true);
  });
});
