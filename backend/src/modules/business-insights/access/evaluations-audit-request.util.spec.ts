import {
  evaluationsAuditActorFromRequest,
  resolveEvaluationsAuditCorrelationId,
} from './evaluations-audit-request.util';

describe('evaluations-audit-request.util', () => {
  it('prefers requestId for correlation', () => {
    expect(
      resolveEvaluationsAuditCorrelationId({
        requestId: 'req-abc',
        headers: { 'x-request-id': 'header-ignored' },
      }),
    ).toBe('req-abc');
  });

  it('falls back to x-request-id header', () => {
    expect(
      resolveEvaluationsAuditCorrelationId({
        headers: { 'x-request-id': 'header-xyz' },
      }),
    ).toBe('header-xyz');
  });

  it('builds actor context from HTTP request', () => {
    const actor = evaluationsAuditActorFromRequest({
      user: { id: 'user-1' },
      requestId: 'req-1',
      method: 'GET',
      route: { path: '/organizations/:orgId/evaluations/export/summary' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    });

    expect(actor).toEqual({
      actorUserId: 'user-1',
      correlationId: 'req-1',
      route: 'GET /organizations/:orgId/evaluations/export/summary',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
