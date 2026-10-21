import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DI_V0_S4P2_PROMETHEUS_ALERT_RULES } from '../../../scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4p2-alert-rules.contract';
import { PlatformOpsDiS4Service } from './platform-ops-di-s4.service';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('PlatformOpsDiS4Service', () => {
  const prisma = {
    diV0S4Control: {
      findUnique: jest.fn().mockResolvedValue({
        killState: 'KILLED',
        updatedAt: new Date('2026-10-12T00:00:00.000Z'),
      }),
    },
    diV0S4WorkItem: {
      groupBy: jest.fn().mockResolvedValue([{ status: 'PENDING', _count: { _all: 2 } }]),
    },
  };

  const alertmanager = {
    getSummary: jest.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      available: true,
      firingCritical: 1,
      firingWarning: 0,
      pending: 0,
      silenced: 0,
      lastNotificationAt: null,
      source: 'alertmanager',
    }),
    getAlertmanagerUrl: jest.fn().mockReturnValue('http://127.0.0.1:9093'),
  };

  let service: PlatformOpsDiS4Service;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PlatformOpsDiS4Service,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformOpsAlertmanagerService, useValue: alertmanager },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                PROMETHEUS_INTERNAL_URL: 'http://127.0.0.1:9090',
                DI_V0_S4_MASTER_ENABLED: 'true',
                DI_V0_S4_VEHICLE_ALLOWLIST: 'v1,v2,v3,v4,v5',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();
    service = module.get(PlatformOpsDiS4Service);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns UNKNOWN operational status when Prometheus is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused')) as typeof fetch;

    const status = await service.getStatus();

    expect(status.processingState).toBe('DISABLED');
    expect(status.monitoringHealth).toBe('UNKNOWN');
    expect(status.globalKill.state).toBe('KILLED');
    expect(status.prometheusAvailable).toBe(false);
    expect(status.cohort.authorizedVehicleCount).toBe(5);
    expect(status.prometheusRules.rules).toHaveLength(15);
  });

  it('maps Prometheus and Alertmanager payloads without secrets', async () => {
    const now = Math.floor(Date.now() / 1000);
    global.fetch = jest.fn(async (input: RequestInfo) => {
      const url = String(input);
      const queryMatch = url.match(/[?&]query=([^&]+)/);
      const promQuery = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
      if (url.includes('/api/v1/query')) {
        if (promQuery.includes('last_success_unixtime')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, String(now - 30)] }] },
          });
        }
        if (promQuery.includes('refresh_error')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, '0'] }] },
          });
        }
        if (promQuery.includes('shadow_plane_engaged')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, '1'] }] },
          });
        }
        if (promQuery === 'synqdrive_scheduler_leader_status') {
          return jsonResponse({
            status: 'success',
            data: {
              result: [
                { metric: { replica: 'a' }, value: [now, '1'] },
                { metric: { replica: 'b' }, value: [now, '0'] },
              ],
            },
          });
        }
        if (promQuery === 'synqdrive_dimo_global_budget_enabled') {
          return jsonResponse({
            status: 'success',
            data: {
              result: [
                { metric: { replica: 'a' }, value: [now, '1'] },
                { metric: { replica: 'b' }, value: [now, '1'] },
              ],
            },
          });
        }
        if (promQuery.startsWith('synqdrive_dimo_')) {
          return jsonResponse({ status: 'success', data: { result: [] } });
        }
        return jsonResponse({ status: 'success', data: { result: [{ metric: {}, value: [now, '0'] }] } });
      }
      if (url.includes('/api/v1/rules')) {
        return jsonResponse({
          status: 'success',
          data: {
            groups: [
              {
                name: 'synqdrive_di_v0_s4_shadow',
                interval: 60,
                rules: [{ name: 'DiV0S4OperationalMetricsStale', state: 'inactive', health: 'ok', labels: { severity: 'critical' } }],
              },
            ],
          },
        });
      }
      if (url.includes('/api/v2/alerts')) {
        return jsonResponse([
          {
            status: { state: 'active' },
            labels: { alertname: 'DiV0S4OperationalMetricsStale', severity: 'critical', component: 'driving_intelligence_s4' },
            annotations: { summary: 'stale' },
            startsAt: '2026-10-12T00:00:00.000Z',
          },
          {
            status: { state: 'active' },
            labels: { alertname: 'IamSeedAdminEnabledInProduction', severity: 'critical', component: 'iam' },
            annotations: { summary: 'seed admin' },
            startsAt: '2026-10-12T00:00:00.000Z',
          },
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const status = await service.getStatus();

    expect(status.monitoringHealth).toBe('CRITICAL');
    expect(status.schedulerLeader.leaderCount).toBe(1);
    expect(status.dimoBudget.allReplicasBudgetEnabled).toBe(true);
    expect(status.s4ActiveAlerts.some((a) => a.alertname.startsWith('DiV0S4'))).toBe(true);
    expect(status.iamSeedAdminFinding.representedInPlatformAlerts).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/password|secret|token/i);
  });

  it('does not elevate monitoringHealth from IAM-only Alertmanager alerts', async () => {
    const now = Math.floor(Date.now() / 1000);
    global.fetch = jest.fn(async (input: RequestInfo) => {
      const url = String(input);
      const queryMatch = url.match(/[?&]query=([^&]+)/);
      const promQuery = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
      if (url.includes('/api/v1/rules')) {
        return jsonResponse({
          status: 'success',
          data: {
            groups: [
              {
                name: 'synqdrive_di_v0_s4_shadow',
                interval: 60,
                rules: DI_V0_S4P2_PROMETHEUS_ALERT_RULES.map((r) => ({
                  name: r.alert,
                  state: 'inactive',
                  health: 'ok',
                  labels: { severity: r.severity },
                })),
              },
            ],
          },
        });
      }
      if (url.includes('/api/v2/alerts')) {
        return jsonResponse([
          {
            status: { state: 'active' },
            labels: { alertname: 'IamSeedAdminEnabledInProduction', severity: 'critical' },
            annotations: { summary: 'seed' },
            startsAt: '2026-10-12T00:00:00.000Z',
          },
        ]);
      }
      if (url.includes('/api/v1/query')) {
        if (promQuery.includes('last_success_unixtime')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, String(now - 30)] }] },
          });
        }
        if (promQuery.includes('refresh_error')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, '0'] }] },
          });
        }
        if (promQuery.includes('control_plane_readable')) {
          return jsonResponse({
            status: 'success',
            data: { result: [{ metric: {}, value: [now, '1'] }] },
          });
        }
        if (promQuery === 'synqdrive_scheduler_leader_status') {
          return jsonResponse({
            status: 'success',
            data: {
              result: [
                { metric: { replica: 'a' }, value: [now, '1'] },
                { metric: { replica: 'b' }, value: [now, '0'] },
              ],
            },
          });
        }
        if (promQuery === 'synqdrive_dimo_global_budget_enabled') {
          return jsonResponse({
            status: 'success',
            data: {
              result: [
                { metric: { replica: 'a' }, value: [now, '1'] },
                { metric: { replica: 'b' }, value: [now, '1'] },
              ],
            },
          });
        }
        if (promQuery.startsWith('synqdrive_dimo_')) {
          return jsonResponse({ status: 'success', data: { result: [] } });
        }
        return jsonResponse({ status: 'success', data: { result: [{ metric: {}, value: [now, '0'] }] } });
      }
      throw new Error(url);
    }) as typeof fetch;

    prisma.diV0S4Control.findUnique.mockResolvedValueOnce({
      killState: 'KILLED',
      updatedAt: new Date('2026-10-12T00:00:00.000Z'),
    });

    const status = await service.getStatus();
    expect(status.monitoringHealth).toBe('HEALTHY');
    expect(status.processingState).toBe('DISABLED');
    expect(status.globalKill.state).toBe('KILLED');
    expect(status.iamSeedAdminFinding.representedInPlatformAlerts).toBe(true);
    expect(status.s4ActiveAlerts).toHaveLength(0);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}
