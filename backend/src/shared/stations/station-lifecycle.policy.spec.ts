import { StationStatus } from '@prisma/client';
import {
  assertArchivedInvariants,
  buildArchiveMutations,
  buildRestoreMutations,
  evaluateStationLifecycle,
  isAllowedStatusTransition,
  SELECTABLE_BOOKING_STATION_STATUSES,
  STATION_LIFECYCLE_STATUSES,
  STATION_STATUS_TRANSITIONS,
  StationLifecycleCommand,
  StationLifecycleReasonCode,
  StationLifecycleRequiredActionCode,
  StationLifecycleWarningCode,
  type StationLifecycleSnapshot,
} from './station-lifecycle.policy';

function station(
  overrides: Partial<StationLifecycleSnapshot> = {},
): StationLifecycleSnapshot {
  return {
    id: 'station-a',
    status: 'ACTIVE',
    isPrimary: false,
    pickupEnabled: true,
    returnEnabled: true,
    archivedAt: null,
    ...overrides,
  };
}

describe('station-lifecycle.policy', () => {
  describe('constants', () => {
    it('defines the three lifecycle statuses', () => {
      expect(STATION_LIFECYCLE_STATUSES).toEqual(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
    });

    it('allows only regulated transitions', () => {
      expect(STATION_STATUS_TRANSITIONS.ACTIVE).toEqual(['INACTIVE', 'ARCHIVED']);
      expect(STATION_STATUS_TRANSITIONS.INACTIVE).toEqual(['ACTIVE', 'ARCHIVED']);
      expect(STATION_STATUS_TRANSITIONS.ARCHIVED).toEqual(['ACTIVE']);
    });

    it('limits booking selection to ACTIVE', () => {
      expect(SELECTABLE_BOOKING_STATION_STATUSES).toEqual(['ACTIVE']);
    });
  });

  describe('isAllowedStatusTransition', () => {
    it.each([
      ['ACTIVE', 'INACTIVE', true],
      ['ACTIVE', 'ARCHIVED', true],
      ['INACTIVE', 'ACTIVE', true],
      ['INACTIVE', 'ARCHIVED', true],
      ['ARCHIVED', 'ACTIVE', true],
      ['ARCHIVED', 'INACTIVE', false],
      ['ACTIVE', 'ACTIVE', true],
      ['INACTIVE', 'INACTIVE', true],
    ] as const satisfies ReadonlyArray<[StationStatus, StationStatus, boolean]>)(
      '%s → %s = %s',
      (from, to, expected) => {
        expect(isAllowedStatusTransition(from, to)).toBe(expected);
      },
    );
  });

  describe('assertArchivedInvariants (R2)', () => {
    it('returns no violations for non-archived station', () => {
      expect(assertArchivedInvariants(station())).toEqual([]);
    });

    it('detects all R2 violations on archived snapshot', () => {
      const violations = assertArchivedInvariants(
        station({
          status: 'ARCHIVED',
          isPrimary: true,
          pickupEnabled: true,
          returnEnabled: true,
          archivedAt: null,
        }),
      );
      expect(violations).toHaveLength(4);
      expect(violations.every((v) => v.code === StationLifecycleReasonCode.ARCHIVED_INVARIANT_VIOLATION)).toBe(
        true,
      );
    });

    it('passes for compliant archived snapshot', () => {
      expect(
        assertArchivedInvariants(
          station({
            status: 'ARCHIVED',
            isPrimary: false,
            pickupEnabled: false,
            returnEnabled: false,
            archivedAt: '2026-07-01T00:00:00.000Z',
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('buildArchiveMutations', () => {
    it('enforces R2 field mutations', () => {
      expect(
        buildArchiveMutations(
          station({ isPrimary: true, pickupEnabled: true, returnEnabled: true }),
        ),
      ).toEqual({
        status: 'ARCHIVED',
        isPrimary: false,
        pickupEnabled: false,
        returnEnabled: false,
        archivedAt: expect.any(Date),
      });
    });
  });

  describe('buildRestoreMutations', () => {
    it('does not blindly re-enable capabilities', () => {
      expect(
        buildRestoreMutations(
          station({
            status: 'ARCHIVED',
            pickupEnabled: false,
            returnEnabled: false,
          }),
        ),
      ).toEqual({
        status: 'ACTIVE',
        archivedAt: null,
        pickupEnabled: false,
        returnEnabled: false,
        isPrimary: false,
      });
    });

    it('honours explicit restore capability payload', () => {
      expect(
        buildRestoreMutations(station({ status: 'ARCHIVED', pickupEnabled: false }), {
          restorePickupEnabled: true,
          restoreReturnEnabled: false,
        }),
      ).toMatchObject({
        pickupEnabled: true,
        returnEnabled: false,
      });
    });
  });

  describe('ARCHIVE', () => {
    it('allows archiving a non-primary active station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station(),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toMatchObject({
        status: 'ARCHIVED',
        isPrimary: false,
        pickupEnabled: false,
        returnEnabled: false,
      });
    });

    it('blocks archiving primary without successor', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station({ isPrimary: true }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
      );
      expect(result.requiredActions[0]?.code).toBe(
        StationLifecycleRequiredActionCode.SET_SUCCESSOR_PRIMARY,
      );
    });

    it('blocks archiving primary when successor is not active', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station({ id: 'primary', isPrimary: true }),
        context: {
          successorPrimaryStationId: 'branch-b',
          successorPrimaryStationStatus: 'INACTIVE',
        },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.SUCCESSOR_PRIMARY_NOT_ACTIVE,
      );
    });

    it('blocks archiving primary when successor is self', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station({ id: 'primary', isPrimary: true }),
        context: {
          successorPrimaryStationId: 'primary',
          successorPrimaryStationStatus: 'ACTIVE',
        },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.SUCCESSOR_PRIMARY_IS_SELF,
      );
    });

    it('allows archiving primary with active successor', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station({ id: 'primary', isPrimary: true }),
        context: {
          successorPrimaryStationId: 'branch-b',
          successorPrimaryStationStatus: 'ACTIVE',
        },
      });
      expect(result.allowed).toBe(true);
      expect(
        result.requiredActions.some(
          (a) => a.code === StationLifecycleRequiredActionCode.TRANSFER_PRIMARY_BEFORE_ARCHIVE,
        ),
      ).toBe(true);
    });

    it('warns when active bookings exist', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station(),
        context: { activeBookingCount: 3 },
      });
      expect(result.allowed).toBe(true);
      expect(result.warnings[0]?.code).toBe(
        StationLifecycleWarningCode.ACTIVE_BOOKINGS_ON_ARCHIVE,
      );
    });

    it('is idempotent for already archived stations', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ARCHIVE,
        station: station({ status: 'ARCHIVED', archivedAt: new Date() }),
      });
      expect(result.allowed).toBe(true);
      expect(result.warnings[0]?.code).toBe(StationLifecycleWarningCode.IDEMPOTENT_ARCHIVE);
    });
  });

  describe('RESTORE', () => {
    it('restores archived station without blind capability enable', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.RESTORE,
        station: station({
          status: 'ARCHIVED',
          pickupEnabled: false,
          returnEnabled: false,
          archivedAt: new Date(),
        }),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toMatchObject({
        status: 'ACTIVE',
        archivedAt: null,
        pickupEnabled: false,
        returnEnabled: false,
        isPrimary: false,
      });
      expect(
        result.warnings.some(
          (w) => w.code === StationLifecycleWarningCode.RESTORE_DOES_NOT_REENABLE_CAPABILITIES,
        ),
      ).toBe(true);
      expect(
        result.requiredActions.some(
          (a) => a.code === StationLifecycleRequiredActionCode.REVIEW_CAPABILITIES_AFTER_RESTORE,
        ),
      ).toBe(true);
    });

    it('rejects restore on non-archived station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.RESTORE,
        station: station({ status: 'ACTIVE' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.NOT_ARCHIVED);
    });
  });

  describe('ACTIVATE / DEACTIVATE', () => {
    it('activates inactive station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ACTIVATE,
        station: station({ status: 'INACTIVE' }),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toEqual({ status: 'ACTIVE' });
    });

    it('blocks direct activate on archived station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.ACTIVATE,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.requiredActions[0]?.code).toBe(
        StationLifecycleRequiredActionCode.USE_LIFECYCLE_COMMAND,
      );
    });

    it('deactivates active station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.DEACTIVATE,
        station: station(),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toEqual({ status: 'INACTIVE' });
    });

    it('blocks deactivate on archived station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.DEACTIVATE,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.STATION_ARCHIVED);
    });
  });

  describe('SET_PRIMARY', () => {
    it('allows set-primary on active station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.SET_PRIMARY,
        station: station(),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toEqual({ isPrimary: true, status: 'ACTIVE' });
    });

    it('blocks set-primary on archived station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.SET_PRIMARY,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.SET_PRIMARY_ON_ARCHIVED,
      );
    });

    it('blocks set-primary on inactive station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.SET_PRIMARY,
        station: station({ status: 'INACTIVE' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.requiredActions[0]?.code).toBe(
        StationLifecycleRequiredActionCode.ACTIVATE_STATION_FIRST,
      );
    });
  });

  describe('UPDATE_CAPABILITIES', () => {
    it('allows separate pickup/return configuration on active station', () => {
      const pickupOnly = evaluateStationLifecycle({
        command: StationLifecycleCommand.UPDATE_CAPABILITIES,
        station: station(),
        context: { nextPickupEnabled: true, nextReturnEnabled: false },
      });
      expect(pickupOnly.allowed).toBe(true);
      expect(pickupOnly.enforcedMutations).toEqual({
        pickupEnabled: true,
        returnEnabled: false,
      });
    });

    it('blocks capability changes on archived station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.UPDATE_CAPABILITIES,
        station: station({ status: 'ARCHIVED' }),
        context: { nextPickupEnabled: true },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.CAPABILITY_CHANGE_ON_ARCHIVED,
      );
    });

    it('blocks capability changes on inactive station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.UPDATE_CAPABILITIES,
        station: station({ status: 'INACTIVE' }),
        context: { nextReturnEnabled: true },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.CAPABILITY_CHANGE_ON_INACTIVE,
      );
    });
  });

  describe('GENERIC_STATUS_PATCH (R1)', () => {
    it('blocks free status changes via generic update', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.GENERIC_STATUS_PATCH,
        station: station({ status: 'ACTIVE' }),
        context: { proposedStatus: 'ARCHIVED' },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.STATUS_CHANGE_VIA_GENERIC_UPDATE_FORBIDDEN,
      );
      expect(result.requiredActions[0]?.code).toBe(
        StationLifecycleRequiredActionCode.USE_LIFECYCLE_COMMAND,
      );
    });

    it('allows generic update when status is unchanged', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.GENERIC_STATUS_PATCH,
        station: station({ status: 'ACTIVE' }),
        context: { proposedStatus: 'ACTIVE' },
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('CREATE', () => {
    it('allows create with ACTIVE default', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.CREATE,
        station: station(),
      });
      expect(result.allowed).toBe(true);
      expect(result.enforcedMutations).toEqual({ status: 'ACTIVE' });
    });

    it('blocks create directly as ARCHIVED', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.CREATE,
        station: station(),
        context: { createStatus: 'ARCHIVED' },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        StationLifecycleReasonCode.CREATE_WITH_ARCHIVED_STATUS,
      );
    });
  });

  describe('booking selection', () => {
    it('allows active station with pickup and return enabled', () => {
      expect(
        evaluateStationLifecycle({
          command: StationLifecycleCommand.BOOKING_PICKUP,
          station: station(),
        }).allowed,
      ).toBe(true);
      expect(
        evaluateStationLifecycle({
          command: StationLifecycleCommand.BOOKING_RETURN,
          station: station(),
        }).allowed,
      ).toBe(true);
    });

    it('blocks archived station for new bookings', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.BOOKING_PICKUP,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.STATION_ARCHIVED);
    });

    it('blocks inactive station for new bookings', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.BOOKING_RETURN,
        station: station({ status: 'INACTIVE' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.STATION_INACTIVE);
    });

    it('blocks pickup when pickupEnabled is false on active station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.BOOKING_PICKUP,
        station: station({ pickupEnabled: false }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.PICKUP_DISABLED);
    });

    it('blocks return when returnEnabled is false on active station', () => {
      const result = evaluateStationLifecycle({
        command: StationLifecycleCommand.BOOKING_RETURN,
        station: station({ returnEnabled: false }),
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(StationLifecycleReasonCode.RETURN_DISABLED);
    });

    it('allows pickup-only active station for pickup but not return', () => {
      const pickupStation = station({ pickupEnabled: true, returnEnabled: false });
      expect(
        evaluateStationLifecycle({
          command: StationLifecycleCommand.BOOKING_PICKUP,
          station: pickupStation,
        }).allowed,
      ).toBe(true);
      expect(
        evaluateStationLifecycle({
          command: StationLifecycleCommand.BOOKING_RETURN,
          station: pickupStation,
        }).allowed,
      ).toBe(false);
    });
  });

  describe('HISTORICAL_READ', () => {
    it('allows historical read for inactive and archived stations', () => {
      const inactive = evaluateStationLifecycle({
        command: StationLifecycleCommand.HISTORICAL_READ,
        station: station({ status: 'INACTIVE' }),
      });
      expect(inactive.allowed).toBe(true);
      expect(inactive.warnings[0]?.code).toBe(
        StationLifecycleWarningCode.INACTIVE_HISTORICAL_READ,
      );

      const archived = evaluateStationLifecycle({
        command: StationLifecycleCommand.HISTORICAL_READ,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(archived.allowed).toBe(true);
      expect(archived.warnings[0]?.code).toBe(
        StationLifecycleWarningCode.ARCHIVED_HISTORICAL_READ,
      );
    });
  });
});
