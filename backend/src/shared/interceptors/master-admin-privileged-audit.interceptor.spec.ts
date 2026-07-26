import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MasterAdminPrivilegedAuditInterceptor } from './master-admin-privileged-audit.interceptor';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';

describe('MasterAdminPrivilegedAuditInterceptor', () => {
  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as MasterAdminAuditService;

  const interceptor = new MasterAdminPrivilegedAuditInterceptor(masterAdminAudit);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function contextFor(req: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as never;
  }

  it('requires reason for destructive privileged routes', () => {
    const req = {
      method: 'DELETE',
      originalUrl: '/api/v1/admin/organizations/org-1',
      user: { id: 'admin-1', platformRole: 'MASTER_ADMIN' },
      body: {},
      headers: {},
    };

    expect(() =>
      interceptor.intercept(contextFor(req), {
        handle: () => of({ ok: true }),
      }),
    ).toThrow(BadRequestException);
  });

  it('records structured audit on successful privileged mutation', (done) => {
    const req = {
      method: 'PATCH',
      originalUrl: '/api/v1/admin/organizations/org-1',
      url: '/api/v1/admin/organizations/org-1',
      user: {
        id: 'admin-1',
        platformRole: 'MASTER_ADMIN',
        platformPermissions: [],
        sessionClaims: { assuranceLevel: 2, mfaAuthenticatedAt: new Date().toISOString() },
      },
      params: { id: 'org-1' },
      body: { reason: 'plan change' },
      headers: {},
      requestId: 'req-1',
      ip: '127.0.0.1',
    };

    interceptor
      .intercept(contextFor(req), {
        handle: () => of({ id: 'org-1' }),
      })
      .subscribe({
        complete: () => {
          expect(masterAdminAudit.record).toHaveBeenCalledWith(
            expect.objectContaining({
              correlationId: 'req-1',
              reasonCode: 'plan change',
              targetOrganizationId: 'org-1',
            }),
          );
          done();
        },
        error: done.fail,
      });
  });

  it('passes through non-admin routes', (done) => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/organizations/org-1/users',
      user: { id: 'user-1', platformRole: 'USER' },
    };

    interceptor
      .intercept(contextFor(req), {
        handle: () => of({}),
      })
      .subscribe({
        complete: () => {
          expect(masterAdminAudit.record).not.toHaveBeenCalled();
          done();
        },
        error: done.fail,
      });
  });
});
