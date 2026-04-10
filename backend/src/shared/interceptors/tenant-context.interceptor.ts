import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Resolves and validates the organization context for tenant-scoped routes.
 * Ensures multi-tenant isolation by validating orgId against user membership.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const orgId = request.params.orgId;

    if (!orgId) {
      return next.handle();
    }

    const user = request.user;
    if (user?.platformRole === 'MASTER_ADMIN') {
      request.tenantId = orgId;
      return next.handle();
    }

    if (user?.organizationId !== orgId) {
      throw new BadRequestException('Organization context mismatch');
    }

    request.tenantId = orgId;
    return next.handle();
  }
}
