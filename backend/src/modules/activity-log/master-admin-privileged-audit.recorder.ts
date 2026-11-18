import { HttpException } from '@nestjs/common';
import { MasterAdminAuditService } from './master-admin-audit.service';
import {
  MasterAdminAuditAction,
} from './master-admin-audit.contract';
import {
  deriveMasterAdminAuditAction,
} from './master-admin-audit.policy';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import {
  buildPrivilegedRouteLabel,
  isMasterPrivilegedRequest,
  resolveCorrelationId,
  resolveEntityId,
  resolveMfaAuditFields,
  resolvePrivilegedReason,
  resolveTargetOrganizationId,
  sanitizePrivilegedAuditPayload,
} from './master-admin-audit.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const PRIVILEGED_FAILURE_AUDIT_FLAG = Symbol('privilegedFailureAuditRecorded');

export type PrivilegedFailureCategory =
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'CLIENT_ERROR'
  | 'SERVER_ERROR';

export type PrivilegedRequestForAudit = {
  method?: string;
  originalUrl?: string;
  url?: string;
  user?: {
    id?: string;
    platformRole?: string;
    platformPermissions?: string[];
    sessionClaims?: { assuranceLevel?: number; mfaAuthenticatedAt?: string | null };
  };
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  requestId?: string;
  ip?: string;
  connection?: { remoteAddress?: string };
};

export function classifyPrivilegedFailureCategory(statusCode: number): PrivilegedFailureCategory {
  if (statusCode === 400 || statusCode === 422) {
    return 'VALIDATION';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTHORIZATION';
  }
  if (statusCode >= 500) {
    return 'SERVER_ERROR';
  }
  return 'CLIENT_ERROR';
}

export function extractSafeResponseCode(responseBody: unknown): string | null {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return null;
  }
  const code = (responseBody as { code?: unknown }).code;
  if (typeof code !== 'string' || code.length > 64) {
    return null;
  }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    return null;
  }
  return code;
}

export function shouldSkipPrivilegedFailureAudit(
  statusCode: number,
  responseBody: unknown,
): boolean {
  const code = extractSafeResponseCode(responseBody);
  if (!code) {
    return false;
  }
  if (
    code === MFA_ERROR.STEP_UP_REQUIRED ||
    code === MFA_ERROR.STEP_UP_EXPIRED ||
    code === MFA_ERROR.ENROLLMENT_REQUIRED
  ) {
    return true;
  }
  return false;
}

export function resolvePermissionGrantedForFailure(
  req: PrivilegedRequestForAudit,
  statusCode: number,
  category: PrivilegedFailureCategory,
): boolean {
  if (category === 'AUTHORIZATION' && (statusCode === 401 || statusCode === 403)) {
    return req.user?.platformRole === 'MASTER_ADMIN';
  }
  return req.user?.platformRole === 'MASTER_ADMIN';
}

export function buildPrivilegedFailureDescription(
  method: string,
  path: string,
  statusCode: number,
  category: PrivilegedFailureCategory,
): string {
  return `${method} ${path} denied (HTTP ${statusCode}, ${category})`;
}

function markFailureRecorded(req: PrivilegedRequestWithAuditFlag): void {
  req[PRIVILEGED_FAILURE_AUDIT_FLAG] = true;
}

function isFailureAlreadyRecorded(req: PrivilegedRequestWithAuditFlag): boolean {
  return Boolean(req[PRIVILEGED_FAILURE_AUDIT_FLAG]);
}

export function recordPrivilegedMutationSuccess(
  masterAdminAudit: MasterAdminAuditService,
  req: PrivilegedRequestForAudit,
  statusCode: number,
): void {
  if (!req.method || !MUTATING_METHODS.has(req.method)) {
    return;
  }
  if (!isMasterPrivilegedRequest(req as never)) {
    return;
  }
  if (statusCode >= 400) {
    return;
  }

  const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
  const correlationId = resolveCorrelationId(req as never);
  const auditAction = deriveMasterAdminAuditAction(req.method, path);
  const mfa = resolveMfaAuditFields(req as never);
  const afterPayload = sanitizePrivilegedAuditPayload(req.body);

  void masterAdminAudit
    .record({
      auditAction,
      actorUserId: req.user?.id,
      actorPlatformRole: req.user?.platformRole ?? null,
      actorPermissions: req.user?.platformPermissions ?? [],
      targetOrganizationId: resolveTargetOrganizationId(req as never),
      entityId: resolveEntityId(req as never),
      description: `${req.method} ${path} completed`,
      reasonCode: resolvePrivilegedReason(req as never),
      correlationId,
      route: buildPrivilegedRouteLabel(req as never),
      httpMethod: req.method,
      httpStatus: statusCode,
      ipAddress: req.ip ?? req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: mfa.mfaStepUpAction,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
      before: null,
      after: afterPayload,
    })
    .catch(() => undefined);
}

export type PrivilegedRequestWithAuditFlag = PrivilegedRequestForAudit &
  Partial<Record<string | symbol, unknown>>;

export function recordPrivilegedMutationFailure(
  masterAdminAudit: MasterAdminAuditService,
  req: PrivilegedRequestWithAuditFlag,
  input: {
    statusCode: number;
    responseBody?: unknown;
    failureCategory?: PrivilegedFailureCategory;
  },
): void {
  if (!req.method || !MUTATING_METHODS.has(req.method)) {
    return;
  }
  if (!isMasterPrivilegedRequest(req as never)) {
    return;
  }
  if (input.statusCode < 400) {
    return;
  }
  if (isFailureAlreadyRecorded(req)) {
    return;
  }
  if (shouldSkipPrivilegedFailureAudit(input.statusCode, input.responseBody)) {
    return;
  }

  const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
  const category = input.failureCategory ?? classifyPrivilegedFailureCategory(input.statusCode);
  const correlationId = resolveCorrelationId(req as never);
  const relatedAction = deriveMasterAdminAuditAction(req.method, path);
  const mfa = resolveMfaAuditFields(req as never);
  const safeCode = extractSafeResponseCode(input.responseBody);
  const permissionGranted = resolvePermissionGrantedForFailure(req, input.statusCode, category);

  markFailureRecorded(req);

  void masterAdminAudit.record({
    auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
    actorUserId: req.user?.id,
    actorPlatformRole: req.user?.platformRole ?? null,
    actorPermissions: req.user?.platformPermissions ?? [],
    targetOrganizationId: resolveTargetOrganizationId(req as never),
    entityId: resolveEntityId(req as never),
    description: buildPrivilegedFailureDescription(req.method, path, input.statusCode, category),
    reasonCode: resolvePrivilegedReason(req as never),
    correlationId,
    route: buildPrivilegedRouteLabel(req as never),
    httpMethod: req.method,
    httpStatus: input.statusCode,
    ipAddress: req.ip ?? req.connection?.remoteAddress,
    userAgent: req.headers?.['user-agent'] as string | undefined,
    mfaStepUpAction: mfa.mfaStepUpAction,
    mfaAssuranceLevel: mfa.mfaAssuranceLevel,
    mfaStepUpUsed: mfa.mfaStepUpUsed,
    permissionGranted,
    level: category === 'SERVER_ERROR' ? 'WARN' : 'WARN',
    before: null,
    after: null,
    metadata: {
      failureCategory: category,
      responseCode: safeCode,
      relatedPrivilegedAction: relatedAction,
    },
  }).catch(() => undefined);
}

export function privilegedFailureFromHttpException(exception: HttpException): {
  statusCode: number;
  responseBody: unknown;
} {
  const statusCode = exception.getStatus();
  const responseBody = exception.getResponse();
  return { statusCode, responseBody };
}