import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OPERATOR_SCOPE_DENIED,
  OPERATOR_SCOPE_OVERRIDE_REASON_REQUIRED,
  assertBookingStationReadable,
  assertBookingStationWritable,
  assertScopeOverrideReason,
  assertTaskCompletable,
  assertTaskReadable,
  bookingMatchesStationScope,
  buildBookingStationScopeWhere,
  canSupervisorOverrideStationScope,
  collectBookingStationIds,
  resolveEffectiveStationFilter,
  resolveTaskStationId,
  taskAssignedToActor,
  taskMatchesStationScope,
  validateActualStationIdForHandover,
  vehicleMatchesStationScope,
} from './operator-resource-scope.policy';
import type { OperatorScopeContext } from './operator-resource-scope.types';

function scopedContext(
  stationIds: string[],
  overrides: Partial<OperatorScopeContext> = {},
): OperatorScopeContext {
  return {
    bypassScope: false,
    allowedStationIds: stationIds,
    membershipRole: 'WORKER',
    userId: 'user-a',
    organizationId: 'org-1',
    fieldAgentAccess: true,
    permissions: { tasks: { read: true, write: true, manage: false } },
    ...overrides,
  };
}

function bypassContext(overrides: Partial<OperatorScopeContext> = {}): OperatorScopeContext {
  return {
    bypassScope: true,
    allowedStationIds: null,
    membershipRole: 'ORG_ADMIN',
    userId: 'admin-1',
    organizationId: 'org-1',
    fieldAgentAccess: true,
    permissions: null,
    ...overrides,
  };
}

describe('operator-resource-scope.policy', () => {
  describe('station filter resolution', () => {
    it('Operator Station A darf Station A', () => {
      const access = scopedContext(['station-a']);
      expect(resolveEffectiveStationFilter(access, 'station-a')).toEqual({
        mode: 'filter',
        stationIds: ['station-a'],
      });
      expect(
        bookingMatchesStationScope(access, { pickupStationId: 'station-a' }),
      ).toBe(true);
    });

    it('Operator Station A darf Station B nicht', () => {
      const access = scopedContext(['station-a']);
      expect(resolveEffectiveStationFilter(access, 'station-b')).toEqual({ mode: 'none' });
      expect(
        bookingMatchesStationScope(access, { pickupStationId: 'station-b' }),
      ).toBe(false);
      expect(() =>
        assertBookingStationReadable(access, { pickupStationId: 'station-b' }),
      ).toThrow(NotFoundException);
    });

    it('Org Admin darf organisationsweit (bypass)', () => {
      const access = bypassContext();
      expect(resolveEffectiveStationFilter(access)).toEqual({ mode: 'bypass' });
      expect(
        bookingMatchesStationScope(access, { pickupStationId: 'station-b' }),
      ).toBe(true);
    });

    it('ignores foreign stationId from request when not in allowlist', () => {
      const access = scopedContext(['station-a']);
      const filter = resolveEffectiveStationFilter(access, 'station-b');
      expect(filter).toEqual({ mode: 'none' });
    });
  });

  describe('supervisor override', () => {
    it('Supervisor mit tasks.manage darf mit Begründung überschreiben', () => {
      const access = scopedContext(['station-a'], {
        permissions: { tasks: { read: true, write: true, manage: true } },
      });
      expect(canSupervisorOverrideStationScope(access)).toBe(true);
      expect(() =>
        assertBookingStationWritable(
          access,
          { pickupStationId: 'station-b' },
          null,
          { override: { scopeOverrideReason: 'Notfall' } },
        ),
      ).not.toThrow();
    });

    it('Override ohne Begründung wird abgelehnt', () => {
      const access = scopedContext(['station-a'], {
        permissions: { tasks: { read: true, write: true, manage: true } },
      });
      expect(() => assertScopeOverrideReason('')).toThrow(BadRequestException);
      expect(() =>
        assertBookingStationWritable(access, { pickupStationId: 'station-b' }, null, {
          override: {},
        }),
      ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: OPERATOR_SCOPE_OVERRIDE_REASON_REQUIRED }) }));
    });
  });

  describe('fehlende Station-Zuordnung', () => {
    it('scoped operator ohne stationIds sieht nichts', () => {
      const access = scopedContext([]);
      expect(resolveEffectiveStationFilter(access)).toEqual({ mode: 'none' });
      expect(buildBookingStationScopeWhere([])).toEqual({ id: { in: [] } });
    });
  });

  describe('booking pickup/return station mismatch', () => {
    it('booking readable wenn pickup ODER return in scope', () => {
      const access = scopedContext(['station-return']);
      expect(
        bookingMatchesStationScope(access, {
          pickupStationId: 'station-pickup',
          returnStationId: 'station-return',
        }),
      ).toBe(true);
      expect(collectBookingStationIds({
        pickupStationId: 'station-pickup',
        returnStationId: 'station-return',
      })).toEqual(['station-pickup', 'station-return']);
    });
  });

  describe('vehicle at different station', () => {
    it('booking readable when vehicle current station is in scope', () => {
      const access = scopedContext(['station-b']);
      expect(
        bookingMatchesStationScope(
          access,
          { pickupStationId: 'station-a' },
          { currentStationId: 'station-b' },
        ),
      ).toBe(true);
    });

    it('vehicle in other station denied without override', () => {
      const access = scopedContext(['station-a']);
      expect(
        vehicleMatchesStationScope(access, { currentStationId: 'station-b' }),
      ).toBe(false);
      expect(() =>
        assertBookingStationWritable(
          access,
          { pickupStationId: 'station-x' },
          { currentStationId: 'station-b' },
        ),
      ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: OPERATOR_SCOPE_DENIED }) }));
    });
  });

  describe('task assignment', () => {
    it('assigned task readable across stations', () => {
      const access = scopedContext(['station-a']);
      const task = { assignedUserId: 'user-a', metadata: { stationId: 'station-b' } };
      expect(taskAssignedToActor(task, 'user-a')).toBe(true);
      expect(() => assertTaskReadable(access, task, 'user-a')).not.toThrow();
    });

    it('unassigned task at foreign station not completable', () => {
      const access = scopedContext(['station-a']);
      const task = { assignedUserId: 'other', metadata: { stationId: 'station-b' }, status: 'OPEN' };
      expect(() =>
        assertTaskCompletable(access, task, 'user-a'),
      ).toThrow(ForbiddenException);
    });

    it('supervisor can complete foreign-station task with reason', () => {
      const access = scopedContext(['station-a'], {
        permissions: { tasks: { read: true, write: true, manage: true } },
      });
      const task = { assignedUserId: 'other', metadata: { stationId: 'station-b' }, status: 'OPEN' };
      const result = assertTaskCompletable(access, task, 'user-a', {
        scopeOverrideReason: 'Vertretung',
      });
      expect(result.overrideApplied).toBe(true);
      expect(result.overrideReason).toBe('Vertretung');
    });

    it('resolveTaskStationId from metadata', () => {
      expect(resolveTaskStationId({ metadata: { stationId: 's1' } })).toBe('s1');
      expect(
        taskMatchesStationScope(scopedContext(['s1']), { metadata: { stationId: 's1' } }),
      ).toBe(true);
    });
  });

  describe('handover actualStationId', () => {
    it('rejects actualStationId not on booking', () => {
      const access = scopedContext(['station-a']);
      expect(() =>
        validateActualStationIdForHandover(
          access,
          { pickupStationId: 'station-a', returnStationId: 'station-b' },
          'PICKUP',
          'station-c',
        ),
      ).toThrow(BadRequestException);
    });

    it('allows actualStationId on booking when in scope', () => {
      const access = scopedContext(['station-b']);
      const result = validateActualStationIdForHandover(
        access,
        { pickupStationId: 'station-a', returnStationId: 'station-b' },
        'RETURN',
        'station-b',
      );
      expect(result).toBe('station-b');
    });
  });
});
