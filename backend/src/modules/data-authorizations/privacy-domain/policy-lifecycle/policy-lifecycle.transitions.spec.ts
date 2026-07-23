import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import {
  assertPolicyLifecycleTransition,
  isPolicyActivatable,
  isPolicyCurrentlyUsable,
  isPolicyLifecycleTransitionAllowed,
  PolicyLifecycleTransitionError,
} from './policy-lifecycle.transitions';

describe('policy-lifecycle.transitions', () => {
  it.each([
    [PrivacyPolicyLifecycleStatus.DRAFT, PrivacyPolicyLifecycleStatus.IN_REVIEW, true],
    [PrivacyPolicyLifecycleStatus.DRAFT, PrivacyPolicyLifecycleStatus.ACTIVE, false],
    [PrivacyPolicyLifecycleStatus.IN_REVIEW, PrivacyPolicyLifecycleStatus.APPROVED, true],
    [PrivacyPolicyLifecycleStatus.IN_REVIEW, PrivacyPolicyLifecycleStatus.REJECTED, true],
    [PrivacyPolicyLifecycleStatus.APPROVED, PrivacyPolicyLifecycleStatus.ACTIVE, true],
    [PrivacyPolicyLifecycleStatus.SCHEDULED, PrivacyPolicyLifecycleStatus.ACTIVE, true],
    [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.SUSPENDED, true],
    [PrivacyPolicyLifecycleStatus.SUSPENDED, PrivacyPolicyLifecycleStatus.ACTIVE, true],
    [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.REVOKED, true],
    [PrivacyPolicyLifecycleStatus.REVOKED, PrivacyPolicyLifecycleStatus.ACTIVE, false],
    [PrivacyPolicyLifecycleStatus.REJECTED, PrivacyPolicyLifecycleStatus.ACTIVE, false],
    [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.SUPERSEDED, true],
  ] as const)(
    'transition %s → %s allowed=%s',
    (from, to, expected) => {
      expect(isPolicyLifecycleTransitionAllowed(from, to)).toBe(expected);
    },
  );

  it('never allows DRAFT → ACTIVE directly', () => {
    expect(
      isPolicyLifecycleTransitionAllowed(
        PrivacyPolicyLifecycleStatus.DRAFT,
        PrivacyPolicyLifecycleStatus.ACTIVE,
      ),
    ).toBe(false);
  });

  it('keeps REJECTED and REVOKED as distinct terminal paths', () => {
    expect(
      isPolicyLifecycleTransitionAllowed(
        PrivacyPolicyLifecycleStatus.IN_REVIEW,
        PrivacyPolicyLifecycleStatus.REJECTED,
      ),
    ).toBe(true);
    expect(
      isPolicyLifecycleTransitionAllowed(
        PrivacyPolicyLifecycleStatus.ACTIVE,
        PrivacyPolicyLifecycleStatus.REVOKED,
      ),
    ).toBe(true);
    expect(
      isPolicyLifecycleTransitionAllowed(
        PrivacyPolicyLifecycleStatus.REVOKED,
        PrivacyPolicyLifecycleStatus.ACTIVE,
      ),
    ).toBe(false);
  });

  it('throws PolicyLifecycleTransitionError for illegal transitions', () => {
    expect(() =>
      assertPolicyLifecycleTransition(
        PrivacyPolicyLifecycleStatus.DRAFT,
        PrivacyPolicyLifecycleStatus.ACTIVE,
      ),
    ).toThrow(PolicyLifecycleTransitionError);
  });

  it('identifies activatable statuses', () => {
    expect(isPolicyActivatable(PrivacyPolicyLifecycleStatus.APPROVED)).toBe(true);
    expect(isPolicyActivatable(PrivacyPolicyLifecycleStatus.SCHEDULED)).toBe(true);
    expect(isPolicyActivatable(PrivacyPolicyLifecycleStatus.DRAFT)).toBe(false);
  });

  it('validates temporal ACTIVE usability', () => {
    const now = new Date('2026-07-01T12:00:00.000Z');
    expect(
      isPolicyCurrentlyUsable({
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        validFrom: new Date('2026-07-02T00:00:00.000Z'),
        now,
      }),
    ).toBe(false);
    expect(
      isPolicyCurrentlyUsable({
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        validUntil: new Date('2026-06-01T00:00:00.000Z'),
        now,
      }),
    ).toBe(false);
    expect(
      isPolicyCurrentlyUsable({
        status: PrivacyPolicyLifecycleStatus.APPROVED,
        now,
      }),
    ).toBe(false);
  });
});
