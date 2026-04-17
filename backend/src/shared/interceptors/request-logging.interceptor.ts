import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';

/**
 * RequestLoggingInterceptor
 *
 * Emits a single structured JSON log line per request containing:
 *  - requestId   (UUID, generated per request, also echoed in X-Request-Id response header)
 *  - method      HTTP method
 *  - url         raw request URL
 *  - route       matched NestJS route pattern (when available)
 *  - userId      from JWT user context (when authenticated)
 *  - organizationId  from JWT / tenantId stamp (when available)
 *  - statusCode  HTTP response status
 *  - durationMs  wall-clock time from request start to response
 *  - userAgent   request User-Agent header
 *  - ip          remote IP
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    const startMs = Date.now();

    // Stamp request ID onto request object so downstream handlers can reference it
    req.requestId = requestId;
    // Echo back to caller for distributed tracing
    res.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res, requestId, startMs),
        error: () => this.log(req, res, requestId, startMs),
      }),
    );
  }

  private log(req: any, res: any, requestId: string, startMs: number) {
    const durationMs = Date.now() - startMs;
    const user = req.user;

    const entry = {
      requestId,
      method: req.method,
      // Redact sensitive query parameters (tokens, passwords, API keys, etc.).
      // An authenticated request URL of the form `/api/foo?token=abc&email=bar`
      // must not hit our log aggregator verbatim (ISO 27001 A.12, GDPR).
      url: redactUrl(req.url),
      statusCode: res.statusCode,
      durationMs,
      userId: user?.id ?? null,
      organizationId: user?.organizationId ?? req.tenantId ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
      ip: req.ip ?? req.connection?.remoteAddress ?? null,
    };

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
    this.logger[level](JSON.stringify(entry));
  }
}

/**
 * Query-string keys that must never appear in plain-text logs. Matched
 * case-insensitively against the whole key name (a key like
 * `userPasswordReset` matches because it contains "password").
 */
const REDACT_QS_KEY_FRAGMENTS = [
  'token',
  'password',
  'secret',
  'apikey',
  'api_key',
  'auth',
  'authorization',
  'session',
  'otp',
  'code',
  'pin',
  'signature',
  'x-api-key',
  'refresh',
];

function redactUrl(url: string | undefined): string {
  if (!url) return '';
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return url;

  const path = url.slice(0, qIdx);
  const qs = url.slice(qIdx + 1);
  // Hand-rolled parser — Node's URL requires a base and can throw on some
  // exotic characters that still appear in real URLs.
  const pairs = qs.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    const keyLower = rawKey.toLowerCase();
    const shouldRedact = REDACT_QS_KEY_FRAGMENTS.some((f) => keyLower.includes(f));
    return shouldRedact ? `${rawKey}=[REDACTED]` : `${rawKey}${eq === -1 ? '' : `=${rawVal}`}`;
  });
  return `${path}?${pairs.join('&')}`;
}
