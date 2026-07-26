import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  MFA_ERROR,
  StepUpActionCode,
  hasFreshMfaAssurance,
} from '@modules/iam-mfa/iam-mfa.policy';
import { resolveIamMfaFeatureFlagsForPrincipal } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { AuthSessionClaims } from '@shared/auth/auth-session-claims.types';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolvePrivilegedReason,
} from '@modules/activity-log/master-admin-audit.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class MasterAdminMfaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly stepUp: IamMfaStepUpService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
    @Optional() private readonly masterAdminAudit?: MasterAdminAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<StepUpActionCode | undefined>(
      MASTER_ADMIN_MFA_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          id?: string;
          platformRole?: string;
          organizationId?: string | null;
          sessionClaims?: AuthSessionClaims;
        }
      | undefined;

    if (!user?.id || user.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      return true;
    }

    const flags = resolveIamMfaFeatureFlagsForPrincipal({
      organizationId: user.organizationId ?? null,
      platformRole: user.platformRole,
    });
    if (!flags.masterAdminMfaEnabled) {
      return true;
    }

    const method = String(request.method ?? 'GET').toUpperCase();
    if (!MUTATING_METHODS.has(method)) {
      return true;
    }

    const enrolled = await this.prisma.userMfaFactor.findFirst({
      where: { userId: user.id, enabledAt: { not: null } },
      select: { id: true },
    });
    if (flags.mfaPrivilegedEnrollmentRequired && !enrolled) {
      throw new ForbiddenException({
        code: MFA_ERROR.ENROLLMENT_REQUIRED,
        message: 'Master admin MFA enrollment is required before performing this action',
        action,
      });
    }

    if (!flags.mfaStepUpEnforced) {
      return true;
    }

    const claims = user.sessionClaims;
    if (claims && hasFreshMfaAssurance(claims)) {
      request.masterAdminMfaStepUpUsed = true;
      request.masterAdminMfaStepUpAction = action;
      return true;
    }

    const headerToken = this.extractStepUpToken(request);
    if (headerToken) {
      const valid = await this.stepUp.validateGrant(user.id, headerToken, action);
      if (valid) {
        request.masterAdminMfaStepUpUsed = true;
        request.masterAdminMfaStepUpAction = action;
        void this.masterAdminAudit?.recordMfaStepUp({
          granted: true,
          actorUserId: user.id,
          stepUpAction: action,
          correlationId: resolveCorrelationId(request),
          route: buildPrivilegedRouteLabel(request),
          ipAddress: request.ip ?? request.connection?.remoteAddress,
          userAgent: request.headers?.['user-agent'],
          reasonCode: resolvePrivilegedReason(request),
        });
        return true;
      }
      this.iamMetrics?.recordStepUpDenied('invalid');
      void this.masterAdminAudit?.recordMfaStepUp({
        granted: false,
        actorUserId: user.id,
        stepUpAction: action,
        correlationId: resolveCorrelationId(request),
        route: buildPrivilegedRouteLabel(request),
        ipAddress: request.ip ?? request.connection?.remoteAddress,
        userAgent: request.headers?.['user-agent'],
        reasonCode: resolvePrivilegedReason(request),
      });
      throw new ForbiddenException({
        code: MFA_ERROR.STEP_UP_EXPIRED,
        message: 'Step-up authentication expired or invalid',
        action,
      });
    }

    this.iamMetrics?.recordStepUpDenied('required');
    void this.masterAdminAudit?.recordMfaStepUp({
      granted: false,
      actorUserId: user.id,
      stepUpAction: action,
      correlationId: resolveCorrelationId(request),
      route: buildPrivilegedRouteLabel(request),
      ipAddress: request.ip ?? request.connection?.remoteAddress,
      userAgent: request.headers?.['user-agent'],
      reasonCode: resolvePrivilegedReason(request),
    });
    throw new ForbiddenException({
      code: MFA_ERROR.STEP_UP_REQUIRED,
      message: 'Fresh MFA step-up required for this master admin action',
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
