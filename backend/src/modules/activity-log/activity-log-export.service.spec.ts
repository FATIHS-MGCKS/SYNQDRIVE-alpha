import { ActivityLogExportService } from './activity-log-export.service';

describe('ActivityLogExportService', () => {
  it('exports normalized rows as JSON', async () => {
    const prisma = {
      activityLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-1',
            organizationId: 'org-1',
            userId: 'user-1',
            action: 'UPDATE',
            entity: 'ADMIN_OPERATION',
            entityId: 'org-1',
            description: 'Updated org',
            changeSummary: null,
            route: 'PATCH /admin/organizations/:id',
            userAgent: 'jest',
            level: 'INFO',
            ipAddress: '127.0.0.1',
            createdAt: new Date('2026-07-26T10:00:00.000Z'),
            metaJson: {
              auditDomain: 'MASTER_ADMIN',
              correlationId: 'corr-1',
            },
            user: { name: 'Admin', email: 'admin@example.com' },
            organization: { companyName: 'Acme GmbH' },
          },
        ]),
      },
    };

    const service = new ActivityLogExportService(prisma as never);
    const result = await service.export({ format: 'json', auditDomain: 'MASTER_ADMIN' });

    expect(result.format).toBe('json');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].trace.correlationId).toBe('corr-1');
    expect(JSON.parse(result.body).rows).toHaveLength(1);
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metaJson: { path: ['auditDomain'], equals: 'MASTER_ADMIN' },
        }),
      }),
    );
  });

  it('exports rows as CSV', async () => {
    const prisma = {
      activityLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new ActivityLogExportService(prisma as never);
    const result = await service.export({ format: 'csv' });

    expect(result.format).toBe('csv');
    expect(result.contentType).toContain('text/csv');
    expect(result.body.split('\n')[0]).toContain('id');
  });
});
