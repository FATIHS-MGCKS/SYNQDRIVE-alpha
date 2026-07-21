import { ForbiddenException } from '@nestjs/common';
import { MfaFactorType } from '@prisma/client';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import {
  ASSURANCE_LEVEL_MFA,
  buildMfaClaims,
  buildPasswordOnlyClaims,
} from '@shared/auth/auth-session-claims.types';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { Reflector } from '@nestjs/core';
import { IamMfaEnrollmentService } from './iam-mfa-enrollment.service';
import { IamMfaChallengeService } from './iam-mfa-challenge.service';
import { IamMfaResetService } from './iam-mfa-reset.service';
import { IamMfaStepUpService } from './iam-mfa-step-up.service';
import { IamMfaService } from './iam-mfa.service';
import {
  MFA_ERROR,
  STEP_UP_ACTION,
  STEP_UP_TTL_MS,
  hasFreshMfaAssurance,
  isPrivilegedAccount,
} from './iam-mfa.policy';
import { encryptMfaSecret } from './iam-mfa-crypto.util';
import { resolveIamMfaEffectiveFeatureFlags } from './iam-mfa-feature-flags.resolver';

describe('IAM MFA and step-up (Prompt 18)', () => {
  const userId = 'user-1';
  const orgId = 'org-a';
  const email = 'admin@example.com';
  const secret = authenticator.generateSecret();

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      IAM_MFA_ENROLLMENT_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
      IAM_MFA_ORG_ALLOWLIST: orgId,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('policy', () => {
    it('detects privileged accounts across platform, admin roles, and manage permissions', () => {
      expect(isPrivilegedAccount({ platformRole: 'MASTER_ADMIN' })).toBe(true);
      expect(isPrivilegedAccount({ membershipRole: 'ORG_ADMIN' })).toBe(true);
      expect(
        isPrivilegedAccount({
          membershipRole: 'WORKER',
          permissions: { 'users-roles': { read: true, write: true, manage: true } },
        }),
      ).toBe(true);
      expect(isPrivilegedAccount({ membershipRole: 'DRIVER' })).toBe(false);
    });

    it('treats fresh MFA assurance within TTL as valid step-up', () => {
      const claims = buildMfaClaims();
      expect(hasFreshMfaAssurance(claims)).toBe(true);
      const stale = buildMfaClaims({
        mfaAuthenticatedAt: new Date(Date.now() - STEP_UP_TTL_MS - 1000).toISOString(),
      });
      expect(hasFreshMfaAssurance(stale)).toBe(false);
    });
  });

  describe('enrollment', () => {
    it('stores encrypted TOTP secret and returns otpauth URL without plaintext secret', async () => {
      const upsert = jest.fn().mockResolvedValue({
        id: 'factor-1',
        factorType: MfaFactorType.TOTP,
      });
      const findUnique = jest.fn().mockResolvedValue(null);
      const prisma = {
        userMfaFactor: { findUnique, upsert },
      } as never;
      const service = new IamMfaEnrollmentService(prisma);

      const result = await service.startTotpEnrollment(userId, email, orgId);

      expect(result.otpauthUrl).toContain('otpauth://');
      expect(result.secretPreview).not.toBe(secret);
      const storedSecret = upsert.mock.calls[0][0].create.encryptedSecret;
      expect(storedSecret).not.toBe(secret);
      expect(storedSecret.length).toBeGreaterThan(20);
    });

    it('confirms enrollment with valid code and returns one-time recovery codes', async () => {
      const encrypted = encryptMfaSecret(secret);
      const code = authenticator.generate(secret);
      const tx = {
        userMfaFactor: {
          update: jest.fn().mockResolvedValue({}),
        },
        userMfaRecoveryCode: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({}),
        },
        user: { update: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        userMfaFactor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'factor-1',
            encryptedSecret: encrypted,
            enabledAt: null,
          }),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      } as never;
      const service = new IamMfaEnrollmentService(prisma);

      const result = await service.confirmTotpEnrollment(
        userId,
        code,
        orgId,
        'enroll:key:1',
      );

      expect(result.enrolled).toBe(true);
      expect(result.recoveryCodes).toHaveLength(10);
      expect(tx.userMfaRecoveryCode.create).toHaveBeenCalledTimes(10);
    });
  });

  describe('challenge', () => {
    it('rejects invalid TOTP code', async () => {
      const prisma = {
        userMfaFactor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'factor-1',
            enabledAt: new Date(),
            encryptedSecret: encryptMfaSecret(secret),
            lastTotpStep: null,
          }),
        },
      } as never;
      const service = new IamMfaChallengeService(
        prisma,
        { reissueAccessToken: jest.fn() } as never,
        { createGrant: jest.fn(), buildClaimsAfterChallenge: jest.fn() } as never,
      );

      await expect(
        service.challengeWithTotp({ userId, code: '000000' }),
      ).rejects.toMatchObject({ response: { code: MFA_ERROR.INVALID_CODE } });
    });

    it('rejects TOTP replay for the same time step', async () => {
      const encrypted = encryptMfaSecret(secret);
      const code = authenticator.generate(secret);
      const step = BigInt(Math.floor(Date.now() / 1000 / 30));
      const prisma = {
        userMfaFactor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'factor-1',
            enabledAt: new Date(),
            encryptedSecret: encrypted,
            lastTotpStep: step,
          }),
          update: jest.fn(),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: userId,
            securityVersion: 0,
            memberships: [],
          }),
        },
      } as never;
      const service = new IamMfaChallengeService(
        prisma,
        { reissueAccessToken: jest.fn() } as never,
        {
          createGrant: jest.fn().mockResolvedValue({ stepUpToken: 'grant', expiresAt: new Date() }),
          buildClaimsAfterChallenge: jest.fn().mockReturnValue(buildMfaClaims()),
        } as never,
      );

      await expect(
        service.challengeWithTotp({ userId, code }),
      ).rejects.toMatchObject({ response: { code: MFA_ERROR.REPLAY } });
    });

    it('accepts recovery code once and elevates session claims', async () => {
      const plainCode = 'ABCD-EF01';
      const codeHash = await bcrypt.hash(plainCode, 4);
      const prisma = {
        userMfaRecoveryCode: {
          findMany: jest.fn().mockResolvedValue([{ id: 'rc-1', codeHash, usedAt: null }]),
          update: jest.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: userId,
            securityVersion: 1,
            memberships: [
              {
                role: 'ORG_ADMIN',
                organizationId: orgId,
                organization: { companyName: 'Org A' },
                permissions: {},
              },
            ],
          }),
        },
      } as never;
      const refreshTokens = {
        reissueAccessToken: jest.fn().mockResolvedValue({
          accessToken: 'jwt-with-aal2',
          expiresIn: '15m',
        }),
      };
      const stepUp = {
        buildClaimsAfterChallenge: jest.fn().mockReturnValue(
          buildMfaClaims({ authMethods: ['pwd', 'recovery'], securityVersion: 1 }),
        ),
        createGrant: jest.fn().mockResolvedValue({
          stepUpToken: 'step-up-token',
          expiresAt: new Date(Date.now() + STEP_UP_TTL_MS),
        }),
      };
      const service = new IamMfaChallengeService(
        prisma,
        refreshTokens as never,
        stepUp as never,
      );

      const result = await service.challengeWithRecoveryCode({
        userId,
        recoveryCode: plainCode,
      });

      expect(result.assuranceLevel).toBe(ASSURANCE_LEVEL_MFA);
      expect(result.authMethods).toContain('recovery');
      expect((prisma as any).userMfaRecoveryCode.update).toHaveBeenCalled();
    });
  });

  describe('step-up guard', () => {
    it('blocks privileged action without fresh MFA when enforcement is enabled', async () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN),
      } as unknown as Reflector;
      const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) } as unknown as IamMfaStepUpService;
      const guard = new StepUpGuard(reflector, stepUp);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: userId,
              organizationId: orgId,
              sessionClaims: buildPasswordOnlyClaims(),
            },
            headers: {},
          }),
        }),
      } as never;

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows privileged action with fresh MFA claims', async () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN),
      } as unknown as Reflector;
      const guard = new StepUpGuard(reflector, { validateGrant: jest.fn() } as never);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: userId,
              organizationId: orgId,
              sessionClaims: buildMfaClaims(),
            },
            headers: {},
          }),
        }),
      } as never;

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('skips enforcement when feature flag is disabled (gradual rollout)', async () => {
      process.env.IAM_MFA_STEP_UP_ENFORCED = 'false';
      const flags = resolveIamMfaEffectiveFeatureFlags(orgId);
      expect(flags.mfaStepUpEnforced).toBe(false);

      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN),
      } as unknown as Reflector;
      const guard = new StepUpGuard(reflector, { validateGrant: jest.fn() } as never);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: userId,
              organizationId: orgId,
              sessionClaims: buildPasswordOnlyClaims(),
            },
            headers: {},
          }),
        }),
      } as never;

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('MFA reset', () => {
    it('revokes sessions, removes factors, and enqueues audit outbox', async () => {
      const iamAudit = {
        enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        processOutboxIds: jest.fn().mockResolvedValue(undefined),
      };
      const tx = {
        userMfaFactor: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        userMfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 10 }) },
        userMfaStepUpGrant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        user: { update: jest.fn().mockResolvedValue({}) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
        organizationMembership: { findFirst: jest.fn().mockResolvedValue({ organizationId: orgId }) },
      };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ id: userId }) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      } as never;
      const service = new IamMfaResetService(
        prisma,
        { revokeAllForUser: jest.fn() } as never,
        iamAudit as never,
      );

      const result = await service.resetMfaForUser({
        organizationId: orgId,
        targetUserId: userId,
        actorUserId: 'actor-1',
        idempotencyKey: 'mfa-reset:user-1',
        reason: 'lost device',
      });

      expect(result.reset).toBe(true);
      expect(result.factorsRemoved).toBe(1);
      expect(result.recoveryCodesRemoved).toBe(10);
      expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'MFA_CHANGED' }),
      );
    });
  });

  describe('multi-org feature flags', () => {
    it('restricts MFA rollout to org allowlist', () => {
      process.env.IAM_MFA_ORG_ALLOWLIST = 'org-a,org-b';
      expect(resolveIamMfaEffectiveFeatureFlags('org-a').mfaEnrollmentEnabled).toBe(true);
      expect(resolveIamMfaEffectiveFeatureFlags('org-z').mfaEnrollmentEnabled).toBe(false);
    });
  });

  describe('session claims', () => {
    it('builds password-only and MFA claim sets', () => {
      const pwd = buildPasswordOnlyClaims(2);
      expect(pwd.assuranceLevel).toBe(1);
      expect(pwd.authMethods).toEqual(['pwd']);
      expect(pwd.securityVersion).toBe(2);

      const mfa = buildMfaClaims({ securityVersion: 3 });
      expect(mfa.assuranceLevel).toBe(2);
      expect(mfa.mfaAuthenticatedAt).toBeTruthy();
      expect(mfa.securityVersion).toBe(3);
    });
  });

  describe('IamMfaService status', () => {
    it('reports enrollment required for privileged users when policy demands it', async () => {
      process.env.IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED = 'true';
      const prisma = {
        userMfaFactor: { findMany: jest.fn().mockResolvedValue([]) },
      } as never;
      const service = new IamMfaService(
        prisma,
        {} as never,
        {
          isMfaEnrolled: jest.fn().mockResolvedValue(false),
          countUnusedRecoveryCodes: jest.fn().mockResolvedValue(0),
        } as never,
        {} as never,
        {} as never,
      );

      const status = await service.getStatus({
        userId,
        email,
        membershipRole: 'ORG_ADMIN',
        organizationId: orgId,
      });

      expect(status.privilegedAccount).toBe(true);
      expect(status.enrollmentRequired).toBe(true);
      expect(status.enrolled).toBe(false);
    });
  });
});
