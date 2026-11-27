import type { MasterAdminAuditOutbox } from '@prisma/client';
import {
  buildProvisionPayloadFingerprint,
  outboxMatchesIdentityOperation,
  readProvisionedUserIdFromOutbox,
  type MasterIdentityOperationBinding,
  MASTER_IDENTITY_OPERATION_DOMAIN,
} from './policies/master-global-identity-operation.policy';

describe('master-global-identity-operation.policy', () => {
  const baseBinding: MasterIdentityOperationBinding = {
    domain: MASTER_IDENTITY_OPERATION_DOMAIN,
    action: 'PROVISION_IDENTITY',
    actorUserId: 'actor-1',
    organizationId: null,
    normalizedEmail: 'user@test.de',
    payloadFingerprint: 'fp-1',
    securityOperationId: 'op-1',
    targetUserId: 'user-1',
  };

  it('rejects replay when actor differs', () => {
    const row = fakeOutbox(baseBinding, { actorUserId: 'actor-2' });
    expect(outboxMatchesIdentityOperation(row, baseBinding)).toBe(false);
  });

  it('accepts replay when binding matches', () => {
    const row = fakeOutbox(baseBinding, {});
    expect(outboxMatchesIdentityOperation(row, baseBinding)).toBe(true);
    expect(readProvisionedUserIdFromOutbox(row)).toBe('user-1');
  });

  it('payload fingerprint changes reject replay', () => {
    const dto = {
      email: 'a@b.de',
      firstName: 'A',
      lastName: 'B',
    };
    const fp1 = buildProvisionPayloadFingerprint('a@b.de', dto as never, false);
    const fp2 = buildProvisionPayloadFingerprint('a@b.de', { ...dto, lastName: 'C' } as never, false);
    expect(fp1).not.toBe(fp2);
  });
});

function fakeOutbox(
  binding: MasterIdentityOperationBinding,
  patch: Partial<MasterIdentityOperationBinding>,
): MasterAdminAuditOutbox {
  const merged = { ...binding, ...patch };
  return {
    id: 'out-1',
    subjectUserId: merged.targetUserId ?? null,
    payload: {
      masterAdminAuditEnvelope: {
        entityId: merged.targetUserId,
        metadata: { operationBinding: merged, targetUserId: merged.targetUserId },
        after: { userId: merged.targetUserId },
      },
    },
  } as unknown as MasterAdminAuditOutbox;
}