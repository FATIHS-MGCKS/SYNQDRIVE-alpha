import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { masterAdminReasonRequired } from '@modules/activity-log/master-admin-audit.policy';
import { isMasterPrivilegedRequest, resolvePrivilegedReason } from '@modules/activity-log/master-admin-audit.util';
import {
  privilegedFailureFromHttpException,
  recordPrivilegedMutationFailure,
  recordPrivilegedMutationSuccess,
} from '@modules/activity-log/master-admin-privileged-audit.recorder';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Structured privileged-access audit for master admin HTTP mutations.
 * Captures actor, permission context, MFA, reason, tenant target, correlation ID, and timestamp.
 */
@Injectable()
export class MasterAdminPrivilegedAuditInterceptor implements NestInterceptor {
  constructor(private readonly masterAdminAudit: MasterAdminAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    if (!isMasterPrivilegedRequest(req)) {
      return next.handle();
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (masterAdminReasonRequired(req.method, path)) {
      const reason = resolvePrivilegedReason(req);
      if (!reason) {
        throw new BadRequestException({
          code: 'PRIVILEGED_REASON_REQUIRED',
          message:
            'A reason is required for this privileged action (body.reason, body.auditReason, or x-privileged-reason header)',
        });
      }
    }

    return next.handle().pipe(
      tap({
        next: () => recordPrivilegedMutationSuccess(this.masterAdminAudit, req, res.statusCode ?? 200),
        error: (err) => {
          if (err instanceof HttpException) {
            const { statusCode, responseBody } = privilegedFailureFromHttpException(err);
            recordPrivilegedMutationFailure(this.masterAdminAudit, req, {
              statusCode,
              responseBody,
            });
            return;
          }
          recordPrivilegedMutationFailure(this.masterAdminAudit, req, {
            statusCode: 500,
            responseBody: { code: 'INTERNAL_ERROR' },
            failureCategory: 'SERVER_ERROR',
          });
        },
      }),
    );
  }
}