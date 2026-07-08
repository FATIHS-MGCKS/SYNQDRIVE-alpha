import { Test, TestingModule } from '@nestjs/testing';
import { ClickHouseDiagnosticsService } from './clickhouse-diagnostics.service';
import { ClickHouseService } from './clickhouse.service';
import { ClickHouseAnalyticsService } from './clickhouse-analytics.service';

describe('ClickHouseDiagnosticsService (integration wiring)', () => {
  const originalUrl = process.env.CLICKHOUSE_URL;
  const originalHf = process.env.HF_MIRROR_ENABLED;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.CLICKHOUSE_URL;
    else process.env.CLICKHOUSE_URL = originalUrl;
    if (originalHf === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = originalHf;
  });

  function makeModule(overrides: {
    status?: ReturnType<ClickHouseService['getStatus']>;
    storage?: Awaited<ReturnType<ClickHouseAnalyticsService['getStorageStats']>>;
  }) {
    const clickHouse = {
      getStatus: jest.fn().mockReturnValue(
        overrides.status ?? {
          configured: false,
          available: false,
          status: 'disabled',
          database: null,
          lastPingAt: null,
          lastSchemaInitAt: null,
          lastSchemaError: null,
          appliedMigrationCount: null,
          pendingMigrationCount: null,
          lastError: 'CLICKHOUSE_URL not configured',
        },
      ),
    };
    const analytics = {
      getStorageStats: jest.fn().mockResolvedValue(overrides.storage ?? null),
    };
    return { clickHouse, analytics };
  }

  async function createService(mocks: ReturnType<typeof makeModule>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClickHouseDiagnosticsService,
        { provide: ClickHouseService, useValue: mocks.clickHouse },
        { provide: ClickHouseAnalyticsService, useValue: mocks.analytics },
      ],
    }).compile();
    return module.get(ClickHouseDiagnosticsService);
  }

  it('returns disabled diagnostics when CLICKHOUSE_URL is empty', async () => {
    delete process.env.CLICKHOUSE_URL;
    process.env.HF_MIRROR_ENABLED = 'false';
    const svc = await createService(makeModule({}));
    const dto = await svc.getDiagnostics();
    expect(dto.clickhouseConfigured).toBe(false);
    expect(dto.clickhouseStatus).toBe('disabled');
    expect(dto.degraded).toBe(false);
    expect(dto.tables.every((t) => t.dataStatus === 'unavailable')).toBe(true);
  });

  it('returns degraded when configured but unavailable', async () => {
    process.env.HF_MIRROR_ENABLED = 'false';
    const svc = await createService(
      makeModule({
        status: {
          configured: true,
          available: false,
          status: 'degraded',
          database: 'synqdrive',
          lastPingAt: null,
          lastSchemaInitAt: null,
          lastSchemaError: null,
          appliedMigrationCount: null,
          pendingMigrationCount: null,
          lastError: 'ping failed',
        },
      }),
    );
    const dto = await svc.getDiagnostics();
    expect(dto.degraded).toBe(true);
    expect(dto.clickhouseStatus).toBe('degraded');
    expect(dto.notes.some((n) => /not reachable/i.test(n))).toBe(true);
  });

  it('includes planned tables without error semantics', async () => {
    process.env.HF_MIRROR_ENABLED = 'false';
    const svc = await createService(
      makeModule({
        status: {
          configured: true,
          available: true,
          status: 'available',
          database: 'synqdrive',
          lastPingAt: '2026-07-08T10:00:00.000Z',
          lastSchemaInitAt: '2026-07-08T09:00:00.000Z',
          lastSchemaError: null,
          appliedMigrationCount: 4,
          pendingMigrationCount: 0,
          lastError: null,
        },
        storage: {
          tableCount: 2,
          totalRows: 0,
          totalCompressedBytes: 0,
          totalUncompressedBytes: 0,
          tables: [
            {
              table: 'trip_activity_windows',
              rowCount: 0,
              compressedBytes: 0,
              uncompressedBytes: 0,
              oldestRecordAt: null,
              newestRecordAt: null,
            },
          ],
        },
      }),
    );
    const dto = await svc.getDiagnostics();
    const planned = dto.tables.find((t) => t.table === 'trip_activity_windows');
    expect(planned?.displayStatus).toBe('planned');
    expect(planned?.expectedEmptyAllowed).toBe(true);
  });
});
