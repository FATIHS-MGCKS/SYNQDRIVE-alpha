import { randomUUID } from 'crypto';
import type { EvaluationsAuditActor } from './evaluations-audit.service';

export function resolveEvaluationsAuditCorrelationId(
  source?: { requestId?: string; headers?: Record<string, unknown> } | null,
): string {
  const headerId = source?.headers?.['x-request-id'];
  if (typeof source?.requestId === 'string' && source.requestId.trim()) {
    return source.requestId.trim();
  }
  if (typeof headerId === 'string' && headerId.trim()) {
    return headerId.trim();
  }
  return `eval-audit:${randomUUID()}`;
}

export function evaluationsAuditActorFromRequest(
  req?: {
    user?: { id?: string };
    requestId?: string;
    ip?: string;
    connection?: { remoteAddress?: string };
    headers?: Record<string, unknown>;
    route?: { path?: string };
    method?: string;
    url?: string;
  } | null,
): EvaluationsAuditActor {
  return {
    actorUserId: req?.user?.id ?? null,
    correlationId: resolveEvaluationsAuditCorrelationId(req),
    route: req?.route?.path
      ? `${req.method ?? 'HTTP'} ${req.route.path}`
      : req?.url
        ? `${req.method ?? 'HTTP'} ${req.url}`
        : undefined,
    ipAddress: req?.ip ?? req?.connection?.remoteAddress,
    userAgent:
      typeof req?.headers?.['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined,
  };
}
