import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import { buildPasswordOnlyClaims } from '@shared/auth/auth-session-claims.types';
import { MasterAdminMfaGuard } from './master-admin-mfa.guard';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';

describe('MasterAdminMfaGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildContext(input: {
    method?: string;
    action?: (typeof STEP_UP_ACTION)[keyof typeof STEP_UP_ACTION];
    user?: Record<string, unknown>;
    headers?: Record<string, string>;
  }) {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(input.action ?? STEP_UP_ACTION.MASTER_BILLING),
    } as unknown as Reflector;
    const prisma = {
      userMfaFactor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }),
      },
    } as never;
    const stepUp = {
      validateGrant: jest.fn().mockResolvedValue(false),
    } as never;
    const guard = new MasterAdminMfaGuard(reflector, prisma, stepUp);
    return {
      guard,
      context: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            method: input.method ?? 'POST',
            user: input.user,
            headers: input.headers ?? {},
          }),
        }),
      } as never,
      prisma,
      stepUp,
    };
  }

  it('skips non-master-admin users', async () => {
    const { guard, context } = buildContext({
      user: { id: 'u1', platformRole: 'USER', sessionClaims: buildPasswordOnlyClaims() },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows master admin GET without step-up for non-sensitive reads', async () => {
    const { guard, context } = buildContext({
      method: 'GET',
      user: {
        id: 'u1',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks master admin audit export GET without MFA step-up', async () => {
    const { guard, context } = buildContext({
      method: 'GET',
      action: STEP_UP_ACTION.MASTER_AUDIT_EXPORT,
      user: {
        id: 'u1',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks master admin POST without MFA step-up', async () => {
    const { guard, context } = buildContext({
      user: {
        id: 'u1',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires metadata action to be set', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new MasterAdminMfaGuard(
      reflector,
      { userMfaFactor: { findFirst: jest.fn() } } as never,
      { validateGrant: jest.fn() } as never,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', user: { id: 'u1', platformRole: 'MASTER_ADMIN' } }),
      }),
    } as never;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(MASTER_ADMIN_MFA_ACTION_KEY, expect.any(Array));
  });
});
