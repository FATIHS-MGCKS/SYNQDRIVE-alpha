import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PAYMENT_PERMISSION_KEY } from '../decorators/require-payment-permission.decorator';
import {
  isPaymentPermissionAction,
  type PaymentPermissionAction,
} from '../payment-permission.constants';
import { PaymentsAccessService } from '../payments-access.service';

/**
 * Enforces granular payment permissions separate from billing.
 * Requires `@RequirePaymentPermission(...)` metadata on the handler.
 *
 * Must run after PaymentsFeatureGuard.
 */
@Injectable()
export class PaymentsPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly paymentsAccess: PaymentsAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<PaymentPermissionAction>(
      PAYMENT_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) {
      return true;
    }

    if (!isPaymentPermissionAction(action)) {
      throw new ForbiddenException(`Unknown payment permission action: ${action}`);
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    await this.paymentsAccess.assertPaymentAccess(request, user, action);
    return true;
  }
}
