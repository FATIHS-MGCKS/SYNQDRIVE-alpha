import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditService } from './master-admin-audit.service';
import {
  PRIVILEGED_FAILURE_AUDIT_FLAG,
  recordPrivilegedMutationFailure,
  recordPrivilegedMutationSuccess,
  shouldSkipPrivilegedFailureAudit,
} from './master-admin-privileged-audit.recorder';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';

describe('master-admin-privileged-audit.recorder', () => {
  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as MasterAdminAuditService;

  beforeEach(() => jest.clearAllMocks());

  const baseReq = {
    method: 'POST',
    originalUrl: '/api/v1/admin/prospects',
    url: '/api/v1/admin/prospects',
    user: { id: 'admin-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    body: { name: 'Acme' },
    headers: {},
    requestId: 'req-deny-1',
  };

  it('skips MFA step-up denial duplicates audited by MasterAdminMfaGuard', () => {
    expect(
      shouldSkipPrivilegedFailureAudit(403, { code: MFA_ERROR.STEP_UP_REQUIRED }),
    ).toBe(true);
    expect(
      shouldSkipPrivilegedFailureAudit(403, { code: MFA_ERROR.STEP_UP_EXPIRED }),
    ).toBe(true);
  });

  it('does not skip MFA enrollment required (not audited by recordMfaStepUp)', () => {
    expect(
      shouldSkipPrivilegedFailureAudit(403, { code: MFA_ERROR.ENROLLMENT_REQUIRED }),
    ).toBe(false);
  });

  it('records privileged mutation denial with sanitized metadata', () => {
    const req = { ...baseReq };
    recordPrivilegedMutationFailure(masterAdminAudit, req, {
      statusCode: 400,
      responseBody: { code: 'VALIDATION_FAILED' },
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        permissionGranted: true,
        httpStatus: 400,
        after: null,
        metadata: expect.objectContaining({
          failureCategory: 'VALIDATION',
          responseCode: 'VALIDATION_FAILED',
        }),
      }),
    );
  });

  it('does not record a second failure for the same request', () => {
    const req: Record<string | symbol, unknown> = { ...baseReq };
    recordPrivilegedMutationFailure(masterAdminAudit, req, { statusCode: 403, responseBody: {} });
    recordPrivilegedMutationFailure(masterAdminAudit, req, { statusCode: 403, responseBody: {} });
    expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
    expect(req[PRIVILEGED_FAILURE_AUDIT_FLAG]).toBe(true);
  });

  it('records success only below HTTP 400', () => {
    recordPrivilegedMutationSuccess(masterAdminAudit, baseReq, 201);
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ auditAction: expect.not.stringMatching(/DENIED/) }),
    );
    jest.clearAllMocks();
    recordPrivilegedMutationSuccess(masterAdminAudit, baseReq, 422);
    expect(masterAdminAudit.record).not.toHaveBeenCalled();
  });
});