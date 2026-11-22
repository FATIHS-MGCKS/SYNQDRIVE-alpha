import * as jwt from 'jsonwebtoken';
import { UserPlatformRole } from '@prisma/client';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { PLATFORM_PERMISSION_JWT_VALUES } from '@modules/users/platform-permissions/platform-permission.constants';

describe('UI audit — grant refresh lifecycle', () => {
  const prior = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterAll(() => {
    if (prior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prior;
  });

  it('reissue drops revoked UI audit grants from access JWT', async () => {
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-life' });
    const user = {
      id: 'audit-user',
      email: 'audit@test.example',
      name: 'Audit',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 1,
    };

    harness.platformPermissions.resolveJwtPermissions
      .mockResolvedValueOnce([PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_RENTAL])
      .mockResolvedValueOnce([]);

    const { accessToken: withGrant } = await harness.service.issueTokenPair(user, null);
    const decodedWith = jwt.decode(withGrant) as { platformPermissions?: string[] };
    expect(decodedWith.platformPermissions).toContain(PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_RENTAL);

    const reissued = await harness.service.reissueAccessToken(user, null, {
      assuranceLevel: 1,
      authenticatedAt: new Date().toISOString(),
      mfaAuthenticatedAt: null,
      authMethods: ['pwd'],
      securityVersion: 1,
    });
    const decodedAfter = jwt.decode(reissued.accessToken) as { platformPermissions?: string[] };
    expect(decodedAfter.platformPermissions ?? []).not.toContain(
      PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_RENTAL,
    );
  });
});