import { resolveHandoverSessionPermissions } from './handover-session-permissions.util';

describe('handover-session-permissions.util', () => {
  const actor = {
    userId: 'user-1',
    displayName: 'Op',
    platformRole: null,
    membershipRole: 'WORKER',
  };

  it('grants all flags for MASTER_ADMIN', () => {
    expect(
      resolveHandoverSessionPermissions(null, {
        ...actor,
        platformRole: 'MASTER_ADMIN',
      }),
    ).toEqual({
      canWriteBookings: true,
      canOverrideScope: true,
      canOverridePickupGate: true,
      canSupersede: true,
    });
  });

  it('denies write without bookings.write', () => {
    const perms = resolveHandoverSessionPermissions(
      {
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { bookings: { read: true, write: false } },
      },
      actor,
    );
    expect(perms.canWriteBookings).toBe(false);
    expect(perms.canOverrideScope).toBe(false);
  });

  it('grants override scope with bookings.manage', () => {
    const perms = resolveHandoverSessionPermissions(
      {
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { bookings: { read: true, write: true, manage: true } },
      },
      actor,
    );
    expect(perms.canOverrideScope).toBe(true);
    expect(perms.canSupersede).toBe(true);
  });
});
