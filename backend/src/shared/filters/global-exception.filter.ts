import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  // Throttle full stack-trace logging per error signature to avoid log floods
  // when a single fault fires on every request (e.g. a broken downstream).
  // Within the window we still log a one-line summary, just without the stack.
  private readonly stackThrottleMs = parseInt(
    process.env.ERROR_STACK_THROTTLE_MS || '60000',
    10,
  );
  private readonly lastStackLogAt = new Map<string, number>();

  private shouldLogStack(signature: string): boolean {
    const now = Date.now();
    const last = this.lastStackLogAt.get(signature) ?? 0;
    if (now - last < this.stackThrottleMs) return false;
    // Bound the map so it cannot grow without limit on high-cardinality routes.
    if (this.lastStackLogAt.size > 500) this.lastStackLogAt.clear();
    this.lastStackLogAt.set(signature, now);
    return true;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'object' && exResponse !== null) {
        response.status(status).json({
          ...(exResponse as Record<string, unknown>),
          timestamp: new Date().toISOString(),
          path: request.url,
        });
        return;
      }
      message = typeof exResponse === 'string' ? exResponse : (exResponse as any).message;
    }

    if (status >= 500) {
      const errName = exception instanceof Error ? exception.name : 'UnknownError';
      const routePath = (request as unknown as { route?: { path?: string } }).route?.path;
      const signature = `${request.method}:${routePath ?? request.url}:${errName}`;
      const includeStack = exception instanceof Error && this.shouldLogStack(signature);
      this.logger.error(
        `${request.method} ${request.url} ${status}${includeStack ? '' : ' (stack throttled)'}`,
        includeStack ? (exception as Error).stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
