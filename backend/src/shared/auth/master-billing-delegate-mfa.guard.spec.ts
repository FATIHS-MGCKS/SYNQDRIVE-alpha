import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import { buildPasswordOnlyClaims } from '@shared/auth/auth-session-claims.types';
import { MasterBillingDelegateMfaGuard } from './master-billing-delegate-mfa.guard';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MASTER_BILLING_KEY } from '@shared/decorators/require-master-billing.decorator';

describe('MasterBillingDelegateMfaGuard', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildContext(input: {
    method?: string;
    user?: Record<string, unknown>;
    billingRequired?: boolean;
    headers?: Record<string, string>;
  }) {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    process.env.IAM_MFA_STEP_UP_ENFORCED = 'true';

    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === MASTER_ADMIN_MFA_ACTION_KEY) return STEP_UP_ACTION.MASTER_SUBSCRIPTION;
        if (key === MASTER_BILLING_KEY) return input.billingRequired !== false;
        return undefined;
      }),
    } as unknown as Reflector;
    const prisma = {
      userMfaFactor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }),
      },
    };
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) };
    const guard = new MasterBillingDelegateMfaGuard(reflector, prisma as never, stepUp as never);
    return {
      guard,
      stepUp,
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
    };
  }

  it('passes through when delegate MFA flag is off', async () => {
    process.env = { ...originalEnv };
    delete process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.MASTER_BILLING),
    } as unknown as Reflector;
    const guard = new MasterBillingDelegateMfaGuard(
      reflector,
      { userMfaFactor: { findFirst: jest.fn() } } as never,
      { validateGrant: jest.fn() } as never,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: {
            id: 'd1',
            platformRole: UserPlatformRole.USER,
            platformPermissions: ['master-billing'],
          },
        }),
      }),
    } as never;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('passes through for MASTER_ADMIN (master-admin MFA guard owns enforcement)', async () => {
    const { guard, context } = buildContext({
      user: {
        id: 'ma1',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('passes through for tenant users without master-billing', async () => {
    const { guard, context } = buildContext({
      user: {
        id: 'org1',
        platformRole: UserPlatformRole.USER,
        platformPermissions: [],
        organizationId: 'org-a',
      },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks billing delegate POST without step-up', async () => {
    const { guard, context } = buildContext({
      user: {
        id: 'd1',
        platformRole: UserPlatformRole.USER,
        platformPermissions: ['master-billing'],
        sessionClaims: buildPasswordOnlyClaims(),
      },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows billing delegate with valid step-up token', async () => {
    const { guard, context, stepUp } = buildContext({
      user: {
        id: 'd1',
        platformRole: UserPlatformRole.USER,
        platformPermissions: ['master-billing'],
        sessionClaims: buildPasswordOnlyClaims(),
      },
      headers: { 'x-step-up-token': 'grant-1' },
    });
    stepUp.validateGrant.mockResolvedValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(stepUp.validateGrant).toHaveBeenCalledWith(
      'd1',
      'grant-1',
      STEP_UP_ACTION.MASTER_SUBSCRIPTION,
    );
  });

  it('audit recordMfaStepUp uses delegate platform role (not MASTER_ADMIN)', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const masterAdminAudit = { recordMfaStepUp: jest.fn().mockResolvedValue(undefined) };
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === MASTER_ADMIN_MFA_ACTION_KEY) return STEP_UP_ACTION.MASTER_SUBSCRIPTION;
        if (key === MASTER_BILLING_KEY) return true;
        return undefined;
      }),
    } as unknown as Reflector;
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(true) };
    const guard = new MasterBillingDelegateMfaGuard(
      reflector,
      { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }) } } as never,
      stepUp as never,
      undefined,
      masterAdminAudit as never,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: {
            id: 'd1',
            platformRole: UserPlatformRole.USER,
            platformPermissions: ['master-billing'],
          },
          headers: { 'x-step-up-token': 'grant-1' },
        }),
      }),
    } as never;
    await guard.canActivate(context);
    expect(masterAdminAudit.recordMfaStepUp).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPlatformRole: UserPlatformRole.USER,
        granted: true,
      }),
    );
  });

  it('requires enrollment when no enabled factor', async () => {
    process.env.IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED = 'true';
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === MASTER_ADMIN_MFA_ACTION_KEY) return STEP_UP_ACTION.MASTER_BILLING;
        if (key === MASTER_BILLING_KEY) return true;
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new MasterBillingDelegateMfaGuard(
      reflector,
      { userMfaFactor: { findFirst: jest.fn().mockResolvedValue(null) } } as never,
      { validateGrant: jest.fn() } as never,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: {
            id: 'd1',
            platformRole: UserPlatformRole.USER,
            platformPermissions: ['master-billing'],
          },
        }),
      }),
    } as never;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MFA_ENROLLMENT_REQUIRED' }),
    });
  });
});