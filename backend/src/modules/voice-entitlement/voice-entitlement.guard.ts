import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VOICE_ENTITLEMENT_KEY } from './require-voice-entitlement.decorator';
import type { VoiceEntitlementCapability } from './voice-entitlement.types';
import {
  VoiceEntitlementDeniedError,
  toEntitlementHttpException,
} from './voice-entitlement-reason-codes';
import { VoiceEntitlementService } from './voice-entitlement.service';

@Injectable()
export class VoiceEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: VoiceEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<VoiceEntitlementCapability[] | undefined>(
      VOICE_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ params?: { orgId?: string } }>();
    const organizationId = request.params?.orgId;
    if (!organizationId) {
      throw new ForbiddenException('Organization context required for voice entitlement check.');
    }

    for (const capability of required) {
      try {
        await this.entitlements.assertCapability(organizationId, capability);
      } catch (err) {
        if (err instanceof VoiceEntitlementDeniedError) {
          throw toEntitlementHttpException(err);
        }
        throw err;
      }
    }

    return true;
  }
}
