import { MembershipRole } from '@prisma/client';
import {
  computeEffectiveModuleAccess,
  effectiveAccessMatchesPreview,
  surfacesAgree,
} from './iam-effective-access.policy';

describe('iam-effective-access.policy (pure domain)', () => {
  it('ORG_ADMIN bypasses module checks', () => {
    expect(
      computeEffectiveModuleAccess({
        membershipRole: MembershipRole.ORG_ADMIN,
        permissions: null,
        module: 'users-roles',
        level: 'manage',
      }),
    ).toBe(true);
  });

  it('WORKER requires explicit module permission', () => {
    expect(
      computeEffectiveModuleAccess({
        membershipRole: MembershipRole.WORKER,
        permissions: { bookings: { read: true, write: false } },
        module: 'users-roles',
        level: 'read',
      }),
    ).toBe(false);
  });

  it('detects guard vs preview mismatch', () => {
    const permissions = { 'users-roles': { read: true, write: false } };
    expect(
      effectiveAccessMatchesPreview(
        true,
        permissions,
        'users-roles',
        'manage',
        MembershipRole.WORKER,
      ),
    ).toBe(false);
  });

  it('surfacesAgree returns false when frontend diverges', () => {
    expect(
      surfacesAgree({
        GUARD: true,
        API_PREVIEW: true,
        FRONTEND: false,
      }),
    ).toBe(false);
  });
});
