import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UiAuditWriteDenyGuard } from './ui-audit-write-deny.guard';

function mockContext(method: string, url: string, user: object | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url, user }),
    }),
  } as ExecutionContext;
}

describe('UiAuditWriteDenyGuard', () => {
  const guard = new UiAuditWriteDenyGuard();

  const auditUser = {
    id: 'u-audit',
    platformRole: 'USER',
    platformPermissions: ['ui-audit-rental'],
  };

  it('passes through unauthenticated requests', () => {
    expect(guard.canActivate(mockContext('POST', '/api/v1/bookings', undefined))).toBe(true);
  });

  it('passes through non-audit users', () => {
    expect(
      guard.canActivate(
        mockContext('POST', '/api/v1/bookings', { id: 'u1', platformRole: 'USER', platformPermissions: [] }),
      ),
    ).toBe(true);
  });

  it('denies business POST for audit-bound user', () => {
    expect(() =>
      guard.canActivate(mockContext('POST', '/api/v1/bookings', auditUser)),
    ).toThrow(ForbiddenException);
  });

  it('allows auth refresh POST for audit-bound user', () => {
    expect(
      guard.canActivate(mockContext('POST', '/api/v1/auth/refresh', auditUser)),
    ).toBe(true);
  });

  it('denies sensitive GET export paths', () => {
    expect(() =>
      guard.canActivate(
        mockContext('GET', '/api/v1/admin/billing/export', {
          ...auditUser,
          platformPermissions: ['ui-audit-master'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('never treats MASTER_ADMIN as audit-bound even with jwt grant strings', () => {
    expect(
      guard.canActivate(
        mockContext('POST', '/api/v1/bookings', {
          id: 'ma',
          platformRole: 'MASTER_ADMIN',
          platformPermissions: ['ui-audit-rental'],
        }),
      ),
    ).toBe(true);
  });
});