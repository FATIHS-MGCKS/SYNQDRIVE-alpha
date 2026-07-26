import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  deriveMasterAdminAuditAction,
  masterAdminReasonRequired,
} from '@modules/activity-log/master-admin-audit.policy';
import {
  buildPrivilegedRouteLabel,
  isMasterPrivilegedRequest,
  resolveCorrelationId,
  resolveEntityId,
  resolveMfaAuditFields,
  resolvePrivilegedReason,
  resolveTargetOrganizationId,
} from '@modules/activity-log/master-admin-audit.util';

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
        next: () => this.record(req, res.statusCode ?? 200),
        error: (err) => {
          const status = err?.status ?? err?.getStatus?.() ?? 500;
          if (status < 500) {
            this.record(req, status, String(err?.message ?? 'failed'));
          }
        },
      }),
    );
  }

  private record(req: any, statusCode: number, errorMessage?: string): void {
    if (statusCode >= 400) {
      return;
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const correlationId = resolveCorrelationId(req);
    const auditAction = deriveMasterAdminAuditAction(req.method, path);
    const mfa = resolveMfaAuditFields(req);

    void this.masterAdminAudit.record({
      auditAction,
      actorUserId: req.user?.id,
      actorPlatformRole: req.user?.platformRole ?? null,
      actorPermissions: req.user?.platformPermissions ?? [],
      targetOrganizationId: resolveTargetOrganizationId(req),
      entityId: resolveEntityId(req),
      description: errorMessage
        ? `${req.method} ${path} failed: ${errorMessage}`
        : `${req.method} ${path} completed`,
      reasonCode: resolvePrivilegedReason(req),
      correlationId,
      route: buildPrivilegedRouteLabel(req),
      httpMethod: req.method,
      httpStatus: statusCode,
      ipAddress: req.ip ?? req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      mfaStepUpAction: mfa.mfaStepUpAction,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
    });
  }
}
