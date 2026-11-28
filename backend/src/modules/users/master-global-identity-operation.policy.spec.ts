import type { MasterAdminAuditOutbox } from '@prisma/client';
import {
  buildProfilePayloadFingerprint,
  buildProvisionPayloadFingerprint,
  canonicalizeForFingerprint,
  outboxMatchesIdentityOperation,
  readProvisionedUserIdFromOutbox,
  stableFingerprintJson,
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

  it('accepts provision replay when expected targetUserId is unset and stored has id', () => {
    const stored = fakeOutbox(baseBinding, { targetUserId: 'created-uuid' });
    const expected: MasterIdentityOperationBinding = {
      ...baseBinding,
      targetUserId: undefined,
    };
    expect(outboxMatchesIdentityOperation(stored, expected)).toBe(true);
    expect(readProvisionedUserIdFromOutbox(stored)).toBe('created-uuid');
  });

  it('requires exact target for profile updates', () => {
    const stored = fakeOutbox({ ...baseBinding, action: 'UPDATE_GLOBAL_PROFILE' }, {});
    const expected: MasterIdentityOperationBinding = {
      ...baseBinding,
      action: 'UPDATE_GLOBAL_PROFILE',
      targetUserId: 'other-user',
    };
    expect(outboxMatchesIdentityOperation(stored, expected)).toBe(false);
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

  it('canonicalizes nested keys regardless of property order', () => {
    const a = { outer: { z: 1, a: { y: 2, b: 3 } } };
    const b = { outer: { a: { b: 3, y: 2 }, z: 1 } };
    expect(stableFingerprintJson(a)).toBe(stableFingerprintJson(b));
    expect(canonicalizeForFingerprint(a)).toEqual(canonicalizeForFingerprint(b));
  });

  it('binds nested initialMembership role and organizationRoleId', () => {
    const dto = {
      email: 'x@y.de',
      initialMembership: {
        organizationId: 'org-1',
        role: 'WORKER',
        organizationRoleId: 'role-a',
      },
    };
    const fpRole = buildProvisionPayloadFingerprint('x@y.de', dto as never, true);
    const fpRoleSwapped = buildProvisionPayloadFingerprint(
      'x@y.de',
      {
        ...dto,
        initialMembership: {
          organizationId: 'org-1',
          role: 'ORG_ADMIN',
          organizationRoleId: 'role-a',
        },
      } as never,
      true,
    );
    expect(fpRole).not.toBe(fpRoleSwapped);
  });

  it('omitted profile field does not affect fingerprint vs absent key', () => {
    const withLang = buildProfilePayloadFingerprint('u1', { language: 'de' } as never);
    const withoutLang = buildProfilePayloadFingerprint('u1', {} as never);
    expect(withLang).not.toBe(withoutLang);
    const omittedPhone = buildProfilePayloadFingerprint('u1', {} as never);
    const nullPhone = buildProfilePayloadFingerprint('u1', { phone: null } as never);
    expect(omittedPhone).not.toBe(nullPhone);
  });

  it('provision fingerprint omits undefined optional strings (no sentinel)', () => {
    const minimal = buildProvisionPayloadFingerprint('a@b.de', { email: 'a@b.de' } as never, false);
    const withFirst = buildProvisionPayloadFingerprint(
      'a@b.de',
      { email: 'a@b.de', firstName: 'A' } as never,
      false,
    );
    expect(minimal).not.toBe(withFirst);
    expect(minimal).not.toContain('omitted');
    expect(withFirst).not.toContain('omitted');
  });

  it('includes every supported profile patch field in fingerprint', () => {
    const dto = { language: 'de' };
    const fp1 = buildProfilePayloadFingerprint('u1', dto as never);
    const fp2 = buildProfilePayloadFingerprint('u1', { language: 'en' } as never);
    expect(fp1).not.toBe(fp2);
    const fp3 = buildProfilePayloadFingerprint('u1', { phone: null } as never);
    expect(fp1).not.toBe(fp3);
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