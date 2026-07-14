import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PaymentsAccessService } from '../payments-access.service';

/**
 * Blocks end-customer payment routes when `Organization.paymentsEnabled` is false.
 * MASTER_ADMIN bypasses for platform rollout and support.
 *
 * Must run after AuthGuard and OrgScopingGuard on org-scoped routes.
 */
@Injectable()
export class PaymentsFeatureGuard implements CanActivate {
  constructor(private readonly paymentsAccess: PaymentsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const orgId = this.paymentsAccess.resolveOrgId(request, user);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }

    await this.paymentsAccess.assertPaymentsFeatureEnabled(orgId, user);
    return true;
  }
}
