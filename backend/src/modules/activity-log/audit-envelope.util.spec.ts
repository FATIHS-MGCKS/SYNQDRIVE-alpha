import { buildAuditEnvelope, normalizeActivityLogForExport } from './audit-envelope.util';

describe('audit-envelope.util', () => {
  it('builds a canonical envelope with actor, target, tenant, trace, network, and diff', () => {
    const envelope = buildAuditEnvelope({
      auditDomain: 'MASTER_ADMIN',
      auditAction: 'ORG_DELETED',
      actorUserId: 'actor-1',
      actorPlatformRole: 'MASTER_ADMIN',
      targetOrganizationId: 'org-1',
      targetEntityId: 'org-1',
      correlationId: 'corr-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      before: { name: 'Old Org' },
      after: null,
      changeSummary: 'Deleted organization',
    });

    expect(envelope).toEqual(
      expect.objectContaining({
        auditDomain: 'MASTER_ADMIN',
        auditAction: 'ORG_DELETED',
        correlationId: 'corr-1',
        requestId: 'corr-1',
        actor: expect.objectContaining({ userId: 'actor-1' }),
        tenant: expect.objectContaining({ organizationId: 'org-1' }),
        trace: expect.objectContaining({ correlationId: 'corr-1' }),
        network: expect.objectContaining({ ipAddress: '127.0.0.1' }),
        diff: expect.objectContaining({
          before: { name: 'Old Org' },
          after: null,
        }),
      }),
    );
  });

  it('normalizes legacy flat metaJson rows for export', () => {
    const row = normalizeActivityLogForExport({
      id: 'log-1',
      organizationId: 'org-1',
      userId: 'user-1',
      action: 'DELETE',
      entity: 'ADMIN_OPERATION',
      entityId: 'org-1',
      description: 'Deleted org',
      changeSummary: null,
      route: 'DELETE /admin/organizations/:id',
      userAgent: 'jest',
      level: 'CRITICAL',
      ipAddress: '10.0.0.1',
      createdAt: new Date('2026-07-26T10:00:00.000Z'),
      metaJson: {
        auditDomain: 'MASTER_ADMIN',
        correlationId: 'corr-legacy',
        actorUserId: 'user-1',
        targetOrganizationId: 'org-1',
      },
      user: { name: 'Admin', email: 'admin@example.com' },
      organization: { companyName: 'Acme GmbH' },
    });

    expect(row.trace.correlationId).toBe('corr-legacy');
    expect(row.tenant.organizationName).toBe('Acme GmbH');
    expect(row.actor.email).toBe('admin@example.com');
    expect(row.network.ipAddress).toBe('10.0.0.1');
  });
});
