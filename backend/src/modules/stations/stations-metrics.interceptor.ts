import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { StationMetricsService } from './station-metrics.service';

function isStationsPath(url: string): boolean {
  return /\/organizations\/[^/]+\/stations(\/|$)/.test(url.split('?')[0]);
}

function resolveScopeDeniedCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const status =
    typeof (error as { getStatus?: () => number }).getStatus === 'function'
      ? (error as { getStatus: () => number }).getStatus()
      : (error as { status?: number }).status;
  if (status !== 403) return null;

  const response = (error as { response?: unknown }).response;
  if (typeof response === 'object' && response !== null && 'code' in response) {
    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' && code.length > 0 ? code : 'forbidden';
  }
  return 'forbidden';
}

function resolveGate(code: string): 'scope' | 'permission' {
  if (code.startsWith('STATION_SCOPE_')) return 'scope';
  if (code.startsWith('STATIONS_PERMISSION_')) return 'permission';
  return 'permission';
}

@Injectable()
export class StationsMetricsInterceptor implements NestInterceptor {
  constructor(private readonly stationMetrics: StationMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method?: string;
      url?: string;
      route?: { path?: string };
    }>();
    const response = http.getResponse<{ statusCode?: number }>();

    const url = request.url ?? '';
    if (!isStationsPath(url)) {
      return next.handle();
    }

    const started = process.hrtime.bigint();

    const record = (statusCode: number) => {
      const elapsedNs = Number(process.hrtime.bigint() - started);
      this.stationMetrics.recordHttp({
        route: request.route?.path ?? url.split('?')[0],
        method: request.method ?? 'GET',
        statusCode,
        durationSeconds: elapsedNs / 1_000_000_000,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode ?? 200),
        error: (error: { status?: number; getStatus?: () => number }) => {
          const status =
            typeof error?.getStatus === 'function'
              ? error.getStatus()
              : error?.status ?? 500;
          const deniedCode = resolveScopeDeniedCode(error);
          if (deniedCode) {
            this.stationMetrics.recordScopeDenied({
              gate: resolveGate(deniedCode),
              reason: deniedCode,
            });
          }
          record(status);
        },
      }),
    );
  }
}
