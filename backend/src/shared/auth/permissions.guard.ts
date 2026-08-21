import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '@shared/decorators/require-permission.decorator';
import {
  COMMUNICATION_COMPAT_CONTEXT_KEY,
  type CommunicationCompatRouteContext,
} from '@shared/decorators/require-communication-permission.decorator';
import {
  VOICE_ASSISTANT_COMPAT_CONTEXT_KEY,
  type VoiceAssistantCompatRouteContext,
} from '@shared/decorators/require-voice-assistant-permission.decorator';
import {
  COMMUNICATION_PERMISSION_MODULE,
  VOICE_ASSISTANT_PERMISSION_MODULE,
} from './communication-permission.constants';
import {
  isCommunicationPermissionGranted,
  isInternalAiAssistantPermissionGranted,
  isVoiceAssistantPermissionGranted,
} from './communication-permission.compat';
import {
  computeEffectiveAccess,
  isModuleAccessAllowed,
} from '@modules/users/policies/effective-access-engine';
import {
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
} from './permission.util';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';

/**
 * Permission-based authorization using `OrganizationMembership.permissions` JSON.
 *
 * Resolution order:
 *   1. No `@RequirePermission` → pass-through (route must still be auth + org scoped).
 *   2. Unauthenticated → deny.
 *   3. MASTER_ADMIN → allow.
 *   4. ORG_ADMIN membership → allow within org.
 *   5. Everyone else → explicit module permission required (never open-by-default).
 *
 * Must run AFTER OrgScopingGuard on org-scoped routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.platformRole === 'MASTER_ADMIN') return true;

    const orgId = resolvePermissionOrgId(request, user);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (membership.role === 'ORG_ADMIN') return true;

    const permissions = normalizeMembershipPermissions(membership.permissions);
    const access = computeEffectiveAccess({
      platformRole: user.platformRole,
      membership: {
        organizationId: orgId,
        role: membership.role,
        status: 'ACTIVE',
        permissions,
      },
      resourceContext: { organizationId: orgId },
    });

    const communicationCompat = this.reflector.getAllAndOverride<
      CommunicationCompatRouteContext | undefined
    >(COMMUNICATION_COMPAT_CONTEXT_KEY, [context.getHandler(), context.getClass()]);

    const voiceAssistantCompat = this.reflector.getAllAndOverride<
      VoiceAssistantCompatRouteContext | undefined
    >(VOICE_ASSISTANT_COMPAT_CONTEXT_KEY, [context.getHandler(), context.getClass()]);

    const granted = this.isPermissionGranted(
      access,
      required,
      communicationCompat,
      voiceAssistantCompat,
    );

    if (!granted) {
      this.logger.warn(
        `PermissionsGuard: user ${user.id} missing ${required.module}.${required.level} in org ${orgId}`,
      );
      this.iamMetrics?.recordEffectiveAccessDenied(required.module, required.level);
      throw new ForbiddenException(
        `Missing permission: ${required.module}.${required.level}`,
      );
    }

    return true;
  }

  private isPermissionGranted(
    access: ReturnType<typeof computeEffectiveAccess>,
    required: RequiredPermission,
    communicationCompat?: CommunicationCompatRouteContext,
    voiceAssistantCompat?: VoiceAssistantCompatRouteContext,
  ): boolean {
    if (required.module === COMMUNICATION_PERMISSION_MODULE) {
      return isCommunicationPermissionGranted(access, required.level, {
        voiceOperationalLegacy: communicationCompat?.voiceOperationalLegacy ?? false,
      });
    }

    if (required.module === VOICE_ASSISTANT_PERMISSION_MODULE) {
      return isVoiceAssistantPermissionGranted(access, required.level, {
        voiceAdminLegacy: voiceAssistantCompat?.voiceAdminLegacy ?? false,
      });
    }

    if (required.module === 'ai-assistant') {
      return isInternalAiAssistantPermissionGranted(access, required.level);
    }

    return isModuleAccessAllowed(access, required.module, required.level);
  }
}
