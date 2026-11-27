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
import { resolveIamMfaFeatureFlagsForPrincipal } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { resolveStepUpGrantValidationContext } from '@modules/iam-mfa/iam-mfa-step-up-validation-context.util';
import type { StepUpGrantRequestCache } from '@modules/iam-mfa/iam-mfa-step-up-binding.types';
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
          membershipId?: string | null;
          tokenFamily?: string | null;
          sessionVersion?: number;
          membershipVersion?: number | null;
          platformRole?: string;
          sessionClaims?: AuthSessionClaims;
        }
      | undefined;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const flags = resolveIamMfaFeatureFlagsForPrincipal({
      organizationId: user.organizationId ?? null,
      platformRole: user.platformRole,
    });
    if (!flags.mfaStepUpEnforced) {
      return true;
    }

    const claims = user.sessionClaims;
    if (claims && hasFreshMfaAssurance(claims)) {
      return true;
    }

    const headerToken = this.extractStepUpToken(request);
    if (headerToken) {
      const grantContext = resolveStepUpGrantValidationContext(user);
      if (!grantContext) {
        this.iamMetrics?.recordStepUpDenied('invalid');
        throw new ForbiddenException({
          code: MFA_ERROR.STEP_UP_EXPIRED,
          message: 'Step-up authentication expired or invalid',
          action,
        });
      }
      const cache = this.resolveRequestGrantCache(request);
      const valid = await this.stepUp.validateGrant(
        user.id,
        headerToken,
        action,
        grantContext,
        cache,
      );
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

  private resolveRequestGrantCache(request: Record<string, unknown>): StepUpGrantRequestCache {
    const existing = request.__stepUpGrantRequestCache as StepUpGrantRequestCache | undefined;
    if (existing) return existing;
    const created: StepUpGrantRequestCache = {};
    request.__stepUpGrantRequestCache = created;
    return created;
  }

  private extractStepUpToken(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const raw = request.headers?.['x-step-up-token'];
    if (!raw) return undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
