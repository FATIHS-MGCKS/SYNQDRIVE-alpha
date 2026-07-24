import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { EvaluationsObservabilityService } from './evaluations-observability.service';
import type { EvaluationsApiRoute } from './evaluations-prometheus.metrics';

function resolveRoute(url: string): EvaluationsApiRoute | null {
  if (url.includes('/dashboard-insights/summary')) return 'dashboard_insights_summary';
  if (url.includes('/dashboard-insights')) return 'dashboard_insights';
  if (url.includes('/data-analyse')) return 'data_analyse';
  if (url.includes('/evaluations-metrics/registry')) return 'evaluations_metrics_registry';
  if (url.includes('/evaluations-metrics/metrics/lookup')) return 'evaluations_metrics_lookup';
  if (url.includes('/admin/business-insights')) return 'admin_insights_run';
  return null;
}

@Injectable()
export class EvaluationsApiObservabilityInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly observability: EvaluationsObservabilityService | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.observability) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; url?: string; headers?: Record<string, string> }>();
    const route = resolveRoute(req.url ?? '');
    if (!route) return next.handle();

    const started = Date.now();
    const correlationId =
      req.headers?.['x-correlation-id']
      ?? req.headers?.['x-request-id']
      ?? this.observability.createCorrelationId();

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<{ statusCode?: number }>();
        this.observability!.observeApi(
          { correlationId, route },
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
          { correlationId, route },
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
