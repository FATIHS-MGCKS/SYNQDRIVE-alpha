import { Prisma, PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { PolicyLifecycleTransitionValidator } from './policy-lifecycle.service';
import { PolicyImmutableException, PolicyNotActivatableException } from './policy-lifecycle.exceptions';

describe('PolicyLifecycleTransitionValidator', () => {
  const validator = new PolicyLifecycleTransitionValidator();

  it('rejects DRAFT → ACTIVE', () => {
    expect(() =>
      validator.assertActivatable(PrivacyPolicyLifecycleStatus.DRAFT),
    ).toThrow(PolicyNotActivatableException);
  });

  it('blocks edits on ACTIVE versions', () => {
    expect(() =>
      validator.assertEditable(PrivacyPolicyLifecycleStatus.ACTIVE),
    ).toThrow(PolicyImmutableException);
  });

  it('requires revocation reason', () => {
    expect(() => validator.assertRevocationReason('')).toThrow();
    expect(() => validator.assertRevocationReason('  ')).toThrow();
  });

  it('blocks reactivation from REVOKED', () => {
    expect(() =>
      validator.assertNotRevokedReactivation(PrivacyPolicyLifecycleStatus.REVOKED),
    ).toThrow();
  });
});

describe('policy single-active prisma util', () => {
  it('detects partial unique index violations', async () => {
    const { isPolicySingleActiveViolation } = await import('./policy-lifecycle-prisma.util');
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['processing_activities_single_active_per_family_key'] },
    });
    expect(isPolicySingleActiveViolation(err, 'PROCESSING_ACTIVITY')).toBe(true);
    expect(isPolicySingleActiveViolation(err, 'ENFORCEMENT_POLICY')).toBe(false);
  });
});
