import { Global, Module, forwardRef } from '@nestjs/common';
import { AuthApiModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { IamMfaService } from './iam-mfa.service';
import { IamMfaEnrollmentService } from './iam-mfa-enrollment.service';
import { IamMfaChallengeService } from './iam-mfa-challenge.service';
import { IamMfaResetService } from './iam-mfa-reset.service';
import { IamMfaStepUpService } from './iam-mfa-step-up.service';
import { IamMfaAccountController } from './iam-mfa-account.controller';
import { IamMfaAdminController } from './iam-mfa-admin.controller';
import { IamPrivilegedActionsController } from './iam-privileged-actions.controller';
import { StepUpGuard } from '@shared/auth/step-up.guard';

/**
 * @Global() because MasterAdminMfaGuard and StepUpGuard are attached via
 * @UseGuards() in controllers spread across many feature modules. Nest builds
 * those guards in the host module's context, so IamMfaStepUpService has to be
 * resolvable everywhere rather than only where IamMfaModule is imported.
 */
@Global()
@Module({
  imports: [AuthApiModule, forwardRef(() => UsersModule)],
  controllers: [
    IamMfaAccountController,
    IamMfaAdminController,
    IamPrivilegedActionsController,
  ],
  providers: [
    IamMfaService,
    IamMfaEnrollmentService,
    IamMfaChallengeService,
    IamMfaResetService,
    IamMfaStepUpService,
    StepUpGuard,
  ],
  exports: [
    IamMfaService,
    IamMfaStepUpService,
    IamMfaEnrollmentService,
    IamMfaChallengeService,
    StepUpGuard,
  ],
})
export class IamMfaModule {}
