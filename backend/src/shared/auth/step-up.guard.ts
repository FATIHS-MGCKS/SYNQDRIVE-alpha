import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STEP_UP_METADATA_KEY } from '@shared/decorators/require-step-up.decorator';
import {
  MFA_ERROR,
  StepUpActionCode,
  hasFreshMfaAssurance,
  requiresStepUpForAction,
} from '@modules/iam-mfa/iam-mfa.policy';
import { resolveIamMfaEffectiveFeatureFlags } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { AuthSessionClaims } from '@shared/auth/auth-session-claims.types';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stepUp: IamMfaStepUpService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<StepUpActionCode | undefined>(
      STEP_UP_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action || !requiresStepUpForAction(action)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          id?: string;
          organizationId?: string | null;
          sessionClaims?: AuthSessionClaims;
        }
      | undefined;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const flags = resolveIamMfaEffectiveFeatureFlags(user.organizationId ?? null);
    if (!flags.mfaStepUpEnforced) {
      return true;
    }

    const claims = user.sessionClaims;
    if (claims && hasFreshMfaAssurance(claims)) {
      return true;
    }

    const headerToken = this.extractStepUpToken(request);
    if (headerToken) {
      const valid = await this.stepUp.validateGrant(user.id, headerToken, action);
      if (valid) return true;
      this.iamMetrics?.recordStepUpDenied('invalid');
      throw new ForbiddenException({
        code: MFA_ERROR.STEP_UP_EXPIRED,
        message: 'Step-up authentication expired or invalid',
        action,
      });
    }

    this.iamMetrics?.recordStepUpDenied('required');
    throw new ForbiddenException({
      code: MFA_ERROR.STEP_UP_REQUIRED,
      message: 'Fresh MFA step-up required for this action',
      action,
    });
  }

  private extractStepUpToken(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const raw = request.headers?.['x-step-up-token'];
    if (!raw) return undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
