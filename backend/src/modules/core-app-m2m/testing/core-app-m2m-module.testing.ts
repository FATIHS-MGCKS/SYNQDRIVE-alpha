import { Provider, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { CoreAppM2mModule } from '../core-app-m2m.module';

export type CoreAppM2mTestModuleExtras = {
  providers?: Provider[];
  controllers?: Type<unknown>[];
};

/**
 * P3-PR5 registered Master Admin routes on CoreAppM2mModule; integration tests must stub
 * MFA/roles guards they do not exercise.
 */
export function createCoreAppM2mIntegrationModule(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
  extras: CoreAppM2mTestModuleExtras = {},
) {
  const builder = Test.createTestingModule({
    imports: [CoreAppM2mModule],
    providers: extras.providers,
    controllers: extras.controllers,
  })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(MasterAdminMfaGuard)
    .useValue({ canActivate: () => true });
  return configure(builder);
}