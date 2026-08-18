import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlatformOpsService } from './platform-ops.service';
import { PlatformAdminService } from './platform-admin.service';
import { BillingAdminService } from '../billing/billing-admin.service';
import { PlatformResilienceStatusService, PlatformConnectivitySummaryService } from './platform-dashboard.service';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import { PlatformOpsInfrastructureService } from './platform-ops-infrastructure.service';

describe('PlatformOpsService', () => {
  let service: PlatformOpsService;

  const platformAdmin = {
    getPlatformHealth: jest.fn(),
    getMonitoringWorkers: jest.fn().mockResolvedValue([]),
  };
  const billingAdmin = { getOverview: jest.fn() };
  const resilienceStatus = {
    getResilienceStatus: jest.fn().mockReturnValue({
      generatedAt: new Date().toISOString(),
      overall: 'healthy',
      postgres: { lastSuccessAt: new Date().toISOString(), status: 'ok' },
      clickhouse: { lastSuccessAt: null, status: 'unknown' },
      offsite: { lastSyncAt: null, status: 'unknown' },
      restoreValidation: { lastRunAt: null, status: 'unknown' },
      source: 'none',
    }),
  };
  const connectivitySummary = {
    getPlatformSummary: jest.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      dimoLinkedVehicles: 0,
      freshness: { live: 0, standby: 0, signal_delayed: 0, offline: 0, no_signal: 0 },
      platform: { dimoTotal: 0, dimoConnected: 0, dimoDisconnected: 0, pollErrorRatePercent: 0, tokenHealthStatus: 'unknown' },
    }),
  };
  const alertmanager = {
    getSummary: jest.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      available: false,
      firingCritical: 0,
      firingWarning: 0,
      pending: 0,
      silenced: 0,
      lastNotificationAt: null,
      source: 'unavailable',
    }),
    getAlertGroups: jest.fn().mockResolvedValue([]),
    getAlertmanagerUrl: jest.fn().mockReturnValue('http://127.0.0.1:9093'),
  };
  const infrastructure = {
    getSummary: jest.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      isStale: false,
      available: false,
      source: 'none',
      diskPercentUsed: null,
      memoryPercentUsed: null,
      cpuPercentUsed: null,
      load1: null,
      uptimeSeconds: null,
      riskLevel: 'unknown',
      signals: [],
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlatformOpsService,
        { provide: PlatformAdminService, useValue: platformAdmin },
        { provide: BillingAdminService, useValue: billingAdmin },
        { provide: PlatformResilienceStatusService, useValue: resilienceStatus },
        { provide: PlatformConnectivitySummaryService, useValue: connectivitySummary },
        { provide: PlatformOpsAlertmanagerService, useValue: alertmanager },
        { provide: PlatformOpsInfrastructureService, useValue: infrastructure },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'METRICS_BEARER_TOKEN' ? 'token' : undefined)) },
        },
      ],
    }).compile();

    service = module.get(PlatformOpsService);
    jest.clearAllMocks();
  });

  it('returns healthy overview when platform health is healthy', async () => {
    platformAdmin.getPlatformHealth.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      overallStatus: 'healthy',
      readiness: {
        status: 'ok',
        checks: {
          postgres: { status: 'ok', responseMs: 5 },
          redis: { status: 'ok', responseMs: 2 },
          clickhouse: { status: 'ok', details: { status: 'disabled' } },
          workers: { status: 'ok' },
          documentExtraction: { status: 'ok' },
        },
      },
      monitoring: { systemHealth: 'healthy', unhealthyWorkers: 0, errorRatePercent: 0 },
      alerts: [],
      queues: [],
      integrations: { dimo: { total: 0, connected: 0, disconnected: 0, tokenHealth: { status: 'VALID' } } },
    });
    billingAdmin.getOverview.mockResolvedValue({
      failedPayments: 0,
      reconciliationDrifts: 0,
      pastDueSubscriptions: 0,
      stripeSyncErrors: 0,
      missingPaymentMethods: 0,
    });

    const overview = await service.getOverview();
    expect(overview.globalPlatformState).toBe('healthy');
    expect(overview.activeIncidents).toHaveLength(0);
  });

  it('returns critical overview when postgres check fails', async () => {
    platformAdmin.getPlatformHealth.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      overallStatus: 'critical',
      readiness: {
        status: 'degraded',
        checks: {
          postgres: { status: 'error', error: 'connection refused' },
          redis: { status: 'ok' },
          clickhouse: { status: 'ok', details: { status: 'disabled' } },
          workers: { status: 'ok' },
          documentExtraction: { status: 'ok' },
        },
      },
      monitoring: { systemHealth: 'critical', unhealthyWorkers: 0, errorRatePercent: 0 },
      alerts: [],
      queues: [],
      integrations: { dimo: { total: 0, connected: 0, disconnected: 0, tokenHealth: {} } },
    });
    billingAdmin.getOverview.mockResolvedValue({
      failedPayments: 0,
      reconciliationDrifts: 0,
      pastDueSubscriptions: 0,
      stripeSyncErrors: 0,
      missingPaymentMethods: 0,
    });

    const overview = await service.getOverview();
    expect(overview.globalPlatformState).toBe('critical');
    expect(overview.degradedServices.some((s) => s.id === 'postgres')).toBe(true);
  });

  it('maps backup resilience critical to resilience tier', async () => {
    resilienceStatus.getResilienceStatus.mockReturnValue({
      generatedAt: new Date().toISOString(),
      overall: 'critical',
      postgres: { lastSuccessAt: null, status: 'failed' },
      clickhouse: { lastSuccessAt: null, status: 'unknown' },
      offsite: { lastSyncAt: null, status: 'unknown' },
      restoreValidation: { lastRunAt: null, status: 'overdue' },
      source: 'json',
    });
    platformAdmin.getPlatformHealth.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      overallStatus: 'healthy',
      readiness: { status: 'ok', checks: { postgres: { status: 'ok' }, redis: { status: 'ok' }, clickhouse: { status: 'ok', details: { status: 'disabled' } }, workers: { status: 'ok' }, documentExtraction: { status: 'ok' } } },
      monitoring: { systemHealth: 'healthy', unhealthyWorkers: 0, errorRatePercent: 0 },
      alerts: [],
      queues: [],
      integrations: { dimo: { total: 0, connected: 0, disconnected: 0, tokenHealth: {} } },
    });
    billingAdmin.getOverview.mockResolvedValue({
      failedPayments: 0,
      reconciliationDrifts: 0,
      pastDueSubscriptions: 0,
      stripeSyncErrors: 0,
      missingPaymentMethods: 0,
    });

    const resilience = await service.getResilience();
    expect(resilience.overall).toBe('critical');
    expect(resilience.tiers.find((t) => t.id === 'postgres')?.status).toBe('critical');
  });
});
