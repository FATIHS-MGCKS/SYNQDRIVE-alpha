import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  UI_AUDIT_AUTH_SESSION_WRITE_ALLOWLIST,
  UI_AUDIT_SENSITIVE_GET_DENYLIST,
} from './ui-audit.constants';
import { isUiAuditBoundUser } from './ui-audit.context';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizePath(url: string | undefined): string {
  if (!url) return '';
  const path = url.split('?')[0] ?? '';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function isAuthSessionWriteAllowed(path: string, method: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  return UI_AUDIT_AUTH_SESSION_WRITE_ALLOWLIST.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );
}

function isSensitiveGetDenied(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') return false;
  return UI_AUDIT_SENSITIVE_GET_DENYLIST.some((re) => re.test(path));
}

/**
 * Global enforcement for least-privilege UI audit identities.
 * Defense-in-depth: does not replace module permission checks or MFA.
 */
@Injectable()
export class UiAuditWriteDenyGuard implements CanActivate {
  private readonly logger = new Logger(UiAuditWriteDenyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!isUiAuditBoundUser(user)) return true;

    const path = normalizePath(request.url ?? request.path);
    const method = String(request.method ?? 'GET').toUpperCase();

    if (isSensitiveGetDenied(path, method)) {
      this.logger.warn(`UiAuditWriteDenyGuard: sensitive read denied user=${user.id} ${method} ${path}`);
      throw new ForbiddenException('UI audit scope: sensitive read denied');
    }

    if (MUTATING_METHODS.has(method) && !isAuthSessionWriteAllowed(path, method)) {
      this.logger.warn(`UiAuditWriteDenyGuard: mutation denied user=${user.id} ${method} ${path}`);
      throw new ForbiddenException('UI audit scope: write operations denied');
    }

    return true;
  }
}