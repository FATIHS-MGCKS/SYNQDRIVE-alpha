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
import { resolveIamMfaMasterBillingDelegateEnabled } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { resolveStepUpGrantValidationContext } from '@modules/iam-mfa/iam-mfa-step-up-validation-context.util';
import type { StepUpGrantRequestCache } from '@modules/iam-mfa/iam-mfa-step-up-binding.types';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import {
  MASTER_BILLING_KEY,
  MASTER_BILLING_PLATFORM_PERMISSION,
} from '@shared/decorators/require-master-billing.decorator';
import { AuthSessionClaims } from '@shared/auth/auth-session-claims.types';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolvePrivilegedReason,
} from '@modules/activity-log/master-admin-audit.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * MFA step-up for platform operators granted `master-billing` (not MASTER_ADMIN).
 * Default OFF via `IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED`.
 * MASTER_ADMIN principals are handled by {@link MasterAdminMfaGuard}.
 */
@Injectable()
export class MasterBillingDelegateMfaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly stepUp: IamMfaStepUpService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
    @Optional() private readonly masterAdminAudit?: MasterAdminAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!resolveIamMfaMasterBillingDelegateEnabled()) {
      return true;
    }

    const action = this.reflector.getAllAndOverride<StepUpActionCode | undefined>(
      MASTER_ADMIN_MFA_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const billingRequired = this.reflector.getAllAndOverride<boolean>(MASTER_BILLING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!billingRequired) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          id?: string;
          platformRole?: string;
          platformPermissions?: string[];
          organizationId?: string | null;
          membershipId?: string | null;
          tokenFamily?: string | null;
          sessionVersion?: number;
          membershipVersion?: number | null;
          sessionClaims?: AuthSessionClaims;
        }
      | undefined;

    if (!user?.id) {
      return true;
    }

    if (user.platformRole === UserPlatformRole.MASTER_ADMIN) {
      return true;
    }

    const platformPermissions = Array.isArray(user.platformPermissions)
      ? user.platformPermissions
      : [];
    if (!platformPermissions.includes(MASTER_BILLING_PLATFORM_PERMISSION)) {
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
    if (!enrolled) {
      throw new ForbiddenException({
        code: MFA_ERROR.ENROLLMENT_REQUIRED,
        message:
          'Master billing operator MFA enrollment is required before performing this action',
        action,
      });
    }

    const claims = user.sessionClaims;
    if (claims && hasFreshMfaAssurance(claims)) {
      request.masterBillingDelegateMfaStepUpUsed = true;
      request.masterBillingDelegateMfaStepUpAction = action;
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
      if (valid) {
        request.masterBillingDelegateMfaStepUpUsed = true;
        request.masterBillingDelegateMfaStepUpAction = action;
        void this.masterAdminAudit?.recordMfaStepUp({
          granted: true,
          actorUserId: user.id,
          actorPlatformRole: user.platformRole,
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
        actorPlatformRole: user.platformRole,
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
      actorPlatformRole: user.platformRole,
      stepUpAction: action,
      correlationId: resolveCorrelationId(request),
      route: buildPrivilegedRouteLabel(request),
      ipAddress: request.ip ?? request.connection?.remoteAddress,
      userAgent: request.headers?.['user-agent'],
      reasonCode: resolvePrivilegedReason(request),
    });
    throw new ForbiddenException({
      code: MFA_ERROR.STEP_UP_REQUIRED,
      message: 'Fresh MFA step-up required for this master billing action',
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