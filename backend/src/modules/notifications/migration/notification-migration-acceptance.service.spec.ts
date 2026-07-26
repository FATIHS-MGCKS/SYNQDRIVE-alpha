import { NotificationMigrationAcceptanceService } from './notification-migration-acceptance.service';

describe('NotificationMigrationAcceptanceService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    notification: { count: jest.fn(), findMany: jest.fn() },
    notificationDeliveryOutbox: { count: jest.fn() },
    dashboardInsight: { findMany: jest.fn() },
  };

  let service: NotificationMigrationAcceptanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
    prisma.notification.count.mockResolvedValue(0);
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notificationDeliveryOutbox.count.mockResolvedValue(0);
    prisma.dashboardInsight.findMany.mockResolvedValue([]);
    service = new NotificationMigrationAcceptanceService(prisma as any);
  });

  it('returns machine-readable JSON report shape', async () => {
    const report = await service.run('org-accept-1');

    expect(report.schemaVersion).toBe('1.0');
    expect(report.organizationId).toBe('org-accept-1');
    expect(report.checks.length).toBeGreaterThanOrEqual(10);
    expect(report.checks.every((c) => c.severity && c.name && typeof c.passed === 'boolean')).toBe(
      true,
    );
  });

  it('fails when duplicate active fingerprints exist', async () => {
    prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => {
      const sql = query.join('');
      if (sql.includes('HAVING COUNT(*) > 1')) {
        return [{ organization_id: 'org-accept-1', fingerprint: 'fp-1', count: BigInt(2) }];
      }
      return [{ count: BigInt(0) }];
    });

    const report = await service.run('org-accept-1');

    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.name === 'no_duplicate_active_fingerprints')?.passed).toBe(
      false,
    );
  });

  it('includes unresolved mapping check with samples', async () => {
    prisma.dashboardInsight.findMany.mockResolvedValue([
      {
        id: 'ins-unmapped',
        organizationId: 'org-accept-1',
        type: 'STATION_SHORTAGE',
        entityIds: [],
        isActive: true,
        updatedAt: new Date(),
      },
    ]);

    const report = await service.run('org-accept-1');
    const mappingCheck = report.checks.find((c) => c.name === 'no_unresolved_mapping_errors');

    expect(mappingCheck?.passed).toBe(false);
    expect(mappingCheck?.samples).toContain('ins-unmapped');
  });

  it('flags migration count inconsistency when insights are unbridged', async () => {
    prisma.dashboardInsight.findMany
      .mockResolvedValueOnce([{ id: 'ins-1' }])
      .mockResolvedValueOnce([]);

    const report = await service.run('org-accept-1');
    const countCheck = report.checks.find((c) => c.name === 'migration_count_consistent');

    expect(countCheck?.passed).toBe(false);
    expect(countCheck?.count).toBe(1);
  });
});
