import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import {
  assertOffboardAuditSemanticMatch,
  offboardAuditSemanticMatch,
} from '../offboarding/offboard-registry-audit';

describe('offboard-registry-audit semantics', () => {
  const base = {
    vehicleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reason: 'OFFBOARD_SOLD' as const,
    actorUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    note: 'Sold to dealer',
  };

  const row = {
    entityId: base.vehicleId,
    organizationId: base.organizationId,
    action: BusinessAuditAction.VEHICLE_REGISTRY_OFFBOARDED,
    payload: {
      description: 'Vehicle registry offboarded',
      metadata: {
        ...base,
        offboardedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };

  it('matches identical note semantics', () => {
    expect(offboardAuditSemanticMatch(row, base)).toBe(true);
  });

  it('rejects conflicting note on same idempotency key', () => {
    expect(() =>
      assertOffboardAuditSemanticMatch(row, { ...base, note: 'Different note' }),
    ).toThrow(/different offboarding/);
  });

  it('matches when both omit note', () => {
    const withoutNote = {
      ...row,
      payload: {
        description: 'Vehicle registry offboarded',
        metadata: {
          vehicleId: base.vehicleId,
          organizationId: base.organizationId,
          reason: base.reason,
          actorUserId: base.actorUserId,
          offboardedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    };
    expect(
      offboardAuditSemanticMatch(withoutNote, {
        vehicleId: base.vehicleId,
        organizationId: base.organizationId,
        reason: base.reason,
        actorUserId: base.actorUserId,
      }),
    ).toBe(true);
  });
});
