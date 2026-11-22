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
import { isUiAuditBoundUser, userHasJwtGrant } from './ui-audit.context';
import {
  matchUiAuditReadRule,
  requiredJwtGrantForScope,
} from './ui-audit-read-allowlist';

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

function assertReadAllowlistProductScope(
  user: { platformPermissions?: string[] },
  method: string,
  path: string,
): void {
  const rule = matchUiAuditReadRule(method, path);
  if (!rule) {
    throw new ForbiddenException('UI audit scope: read not allowlisted');
  }
  const requiredGrant = requiredJwtGrantForScope(rule.scope);
  if (requiredGrant && !userHasJwtGrant(user, requiredGrant)) {
    throw new ForbiddenException('UI audit scope: product grant required');
  }
}

/**
 * Global enforcement for least-privilege UI audit identities.
 * Default deny on reads outside explicit allowlist; default deny on writes outside auth maintenance.
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

    if (MUTATING_METHODS.has(method)) {
      if (!isAuthSessionWriteAllowed(path, method)) {
        this.logger.warn(`UiAuditWriteDenyGuard: mutation denied user=${user.id} ${method} ${path}`);
        throw new ForbiddenException('UI audit scope: write operations denied');
      }
      return true;
    }

    if (method === 'GET' || method === 'HEAD') {
      assertReadAllowlistProductScope(user, method, path);
      return true;
    }

    throw new ForbiddenException('UI audit scope: method denied');
  }
}