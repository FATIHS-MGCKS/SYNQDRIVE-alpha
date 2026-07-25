import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { OperatorObservabilityService } from './operator-observability.service';
import {
  isOperatorApiPath,
  orgRef,
  resolveCorrelationId,
  resolveOperatorApiRoute,
} from './operator-observability.util';
import type { OperatorApiRoute } from './operator-prometheus.metrics';

function resolveRoute(path: string, method: string): OperatorApiRoute | null {
  const base = resolveOperatorApiRoute(path);
  if (!base) return null;
  const verb = method.toUpperCase();
  if (
    base === 'bookings_scan' &&
    (verb === 'POST' || verb === 'PATCH' || verb === 'DELETE')
  ) {
    return 'bookings_mutate';
  }
  return base;
}

@Injectable()
export class OperatorApiObservabilityInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly observability: OperatorObservabilityService | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.observability) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      url?: string;
      requestId?: string;
      tenantId?: string;
      user?: { organizationId?: string };
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const path = req.url ?? '';
    if (!isOperatorApiPath(path)) return next.handle();

    const route = resolveRoute(path, req.method ?? 'GET');
    if (!route) return next.handle();

    const started = Date.now();
    const correlationId = resolveCorrelationId(req.headers);
    const logCtx = {
      correlationId,
      requestId: req.requestId ?? correlationId,
      orgRef: orgRef(req.user?.organizationId ?? req.tenantId ?? null),
      route,
    };

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<{ statusCode?: number }>();
        this.observability!.observeApi(
          logCtx,
          {
            route,
            method: (req.method ?? 'GET').toUpperCase(),
            statusCode: res.statusCode ?? 200,
            result: 'success',
          },
          Date.now() - started,
        );
      }),
      catchError((err) => {
        const statusCode = typeof err?.status === 'number' ? err.status : 500;
        this.observability!.observeApi(
          logCtx,
          {
            route,
            method: (req.method ?? 'GET').toUpperCase(),
            statusCode,
            result: 'error',
          },
          Date.now() - started,
        );
        return throwError(() => err);
      }),
    );
  }
}
