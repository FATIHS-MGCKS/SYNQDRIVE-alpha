import { INestApplication, Provider, Type } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import type { StepUpActionCode } from '@modules/iam-mfa/iam-mfa.policy';

export const MFA_HTTP_MASTER = 'master-admin-1';
export const MFA_HTTP_ORG = '11111111-1111-1111-1111-111111111111';

const MFA_ENFORCED_ENV: Record<string, string> = {
  IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
  IAM_MFA_STEP_UP_ENFORCED: 'true',
  IAM_MFA_ENROLLMENT_ENABLED: 'true',
  IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'true',
};

/** Restores process.env after each test even when expectations fail. */
export function installMfaEnforcedEnvForSuite(): void {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
    process.env = { ...savedEnv, ...MFA_ENFORCED_ENV };
  });

  afterEach(() => {
    process.env = savedEnv;
  });
}

export function createMasterAdminAuthGuard() {
  return {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole; sessionClaims?: unknown };
      };
      const auth = String(req.headers?.authorization ?? '');
      if (auth.startsWith('Bearer master-')) {
        req.user = { id: MFA_HTTP_MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      if (auth.startsWith('Bearer member-')) {
        req.user = { id: 'member-user', platformRole: UserPlatformRole.USER };
        return true;
      }
      return false;
    },
  };
}

export type MasterAdminMfaHttpHarness = {
  app: INestApplication;
  moduleRef: TestingModule;
  validateGrant: jest.Mock;
  prismaMfaFactorFindFirst: jest.Mock;
};

export async function createMasterAdminMfaHttpHarness(input: {
  controller: Type<unknown>;
  providers: Provider[];
}): Promise<MasterAdminMfaHttpHarness> {
  const validateGrant = jest.fn();
  const prismaMfaFactorFindFirst = jest.fn().mockResolvedValue({ id: 'mfa-factor-1' });

  const moduleRef = await Test.createTestingModule({
    controllers: [input.controller],
    providers: [
      ...input.providers,
      { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
      Reflector,
      MasterAdminMfaGuard,
      { provide: PrismaService, useValue: { userMfaFactor: { findFirst: prismaMfaFactorFindFirst } } },
      { provide: IamMfaStepUpService, useValue: { validateGrant } },
    ],
  })
    .overrideGuard(RolesGuard)
    .useValue({
      canActivate: (ctx: {
        switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
      }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
    })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, moduleRef, validateGrant, prismaMfaFactorFindFirst };
}

export async function closeMasterAdminMfaHttpHarness(
  harness: MasterAdminMfaHttpHarness | undefined,
): Promise<void> {
  if (harness?.app) {
    await harness.app.close();
  }
}

export function expectStepUpValidation(
  validateGrant: jest.Mock,
  expectedAction: StepUpActionCode,
  token = 'step-up-token-valid',
): void {
  expect(validateGrant).toHaveBeenCalledWith(MFA_HTTP_MASTER, token, expectedAction);
}