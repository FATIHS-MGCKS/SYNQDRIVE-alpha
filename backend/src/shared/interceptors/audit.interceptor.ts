import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';

// HTTP methods that mutate state
const AUDIT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes that are too noisy to auto-audit at the interceptor level
// (they are audited explicitly at the service level instead)
const SKIP_PREFIXES = [
  '/api/v1/health',
  '/api/v1/metrics',
  '/api/v1/webhooks/',        // webhook ingestion — high volume, audited internally
  '/api/v1/integrations/high-mobility/webhook',
];

function shouldSkipAudit(url: string): boolean {
  if (SKIP_PREFIXES.some((p) => url.startsWith(p))) return true;
  const path = url.split('?')[0];
  return /\/organizations\/[^/]+\/stations(\/|$)/.test(path);
}

function deriveEntity(url: string): ActivityEntity {
  const path = url.split('?')[0].toLowerCase();
  if (path.includes('/vehicles')) return ActivityEntity.VEHICLE;
  if (path.includes('/bookings')) return ActivityEntity.BOOKING;
  if (path.includes('/customers')) return ActivityEntity.CUSTOMER;
  if (path.includes('/users')) return ActivityEntity.USER;
  if (path.includes('/organizations')) return ActivityEntity.ORGANIZATION;
  if (path.includes('/stations')) return ActivityEntity.STATION;
  if (path.includes('/support')) return ActivityEntity.SUPPORT_TICKET;
  if (path.includes('/tasks')) return ActivityEntity.TASK;
  if (path.includes('/invoices')) return ActivityEntity.INVOICE;
  if (path.includes('/fines')) return ActivityEntity.FINE;
  if (path.includes('/auth')) return ActivityEntity.AUTH_EVENT;
  return ActivityEntity.INTEGRATION;
}

function deriveAction(method: string, statusCode: number): ActivityAction {
  if (statusCode >= 400) return ActivityAction.AUTH_FAIL; // only for 4xx
  switch (method) {
    case 'POST':   return ActivityAction.CREATE;
    case 'PUT':
    case 'PATCH':  return ActivityAction.UPDATE;
    case 'DELETE': return ActivityAction.DELETE;
    default:       return ActivityAction.SYNC;
  }
}

/**
 * AuditInterceptor — global interceptor that auto-logs all mutating HTTP operations.
 *
 * Captures: actorUserId, organizationId, route, method, IP, userAgent, statusCode.
 * Runs AFTER the handler resolves to capture the final HTTP status.
 * Only logs mutating methods (POST/PUT/PATCH/DELETE) on non-skipped paths.
 * Audit errors are swallowed — they never break the request flow.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    if (!AUDIT_METHODS.has(req.method)) return next.handle();
    if (shouldSkipAudit(req.url ?? '')) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(req, res),
        error: (err) => this.logRequest(req, res, err),
      }),
    );
  }

  private logRequest(req: any, res: any, _err?: unknown): void {
    const statusCode: number = res.statusCode ?? 500;
    const entity = deriveEntity(req.url ?? '');
    const action = deriveAction(req.method, statusCode);
    const isError = statusCode >= 400;

    void this.audit.record({
      actorUserId: req.user?.id,
      actorOrganizationId: req.user?.organizationId ?? req.tenantId,
      action,
      entity,
      description: `${req.method} ${req.url} → ${statusCode}`,
      route: req.route?.path ? `${req.method} ${req.route.path}` : `${req.method} ${req.url}`,
      ipAddress: req.ip ?? req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      level: statusCode >= 500 ? 'CRITICAL' : isError ? 'WARN' : 'INFO',
    });
  }
}
