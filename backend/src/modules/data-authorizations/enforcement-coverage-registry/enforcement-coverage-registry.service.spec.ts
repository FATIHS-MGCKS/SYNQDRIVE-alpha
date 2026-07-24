import {
  ENFORCEMENT_COVERAGE_RUNTIME_HEALTH,
  ENFORCEMENT_COVERAGE_STATUS,
  ENFORCEMENT_COVERAGE_TEST_STATUS,
} from './enforcement-coverage-registry.constants';
import { ENFORCEMENT_COVERAGE_CATALOG } from './enforcement-coverage-catalog';
import { EnforcementCoverageHealthService } from './enforcement-coverage-health.service';
import { EnforcementCoverageRegistryMetricsService } from './enforcement-coverage-registry.metrics';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry.service';

describe('EnforcementCoverageRegistryService', () => {
  let healthService: EnforcementCoverageHealthService;
  let metrics: EnforcementCoverageRegistryMetricsService;
  let auditService: { recordIngestionSkipped: jest.Mock };
  let service: EnforcementCoverageRegistryService;

  beforeEach(() => {
    healthService = new EnforcementCoverageHealthService();
    metrics = new EnforcementCoverageRegistryMetricsService();
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    service = new EnforcementCoverageRegistryService(healthService, metrics, auditService as never);
    delete process.env.DATA_AUTH_INGEST_SHADOW_MODE;
    delete process.env.DATA_AUTH_TRIP_LOCATION_SHADOW_MODE;
    delete process.env.DATA_AUTH_HEALTH_SHADOW_MODE;
    delete process.env.DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE;
    delete process.env.DATA_AUTH_NOTIFICATION_SHADOW_MODE;
    delete process.env.DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE;
  });

  afterEach(() => {
    metrics.reset();
  });

  it('evaluates all catalog flows with version binding', () => {
    const summary = service.evaluate('org-1', 'corr-coverage-1');
    expect(summary.totalFlows).toBe(ENFORCEMENT_COVERAGE_CATALOG.length);
    expect(summary.coverageVersion).toMatch(/2026-07-prompt27-v1@/);
    expect(summary.evaluatedAt).toBeTruthy();
    expect(summary.flows.every((f) => f.flowId && f.status)).toBe(true);
  });

  it('fullyProtected is false when any productive flow is not ENFORCED', () => {
    const summary = service.evaluate('org-1', 'corr-coverage-2');
    expect(summary.fullyProtected).toBe(false);
    expect(summary.enforcedCount).toBeLessThan(summary.totalFlows);
  });

  it('marks shadow-mode flows as PARTIALLY_ENFORCED', () => {
    process.env.DATA_AUTH_INGEST_SHADOW_MODE = 'true';
    const summary = service.evaluate('org-1', 'corr-shadow');
    const ingest = summary.flows.find((f) => f.flowId === 'telemetry-dimo-snapshot-ingest');
    expect(ingest?.shadowModeActive).toBe(true);
    expect(ingest?.status).toBe(ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED);
  });

  it('marks unwired flows as PARTIALLY_ENFORCED or NOT_IMPLEMENTED', () => {
    const summary = service.evaluate('org-1', 'corr-gap');
    const backfill = summary.flows.find((f) => f.flowId === 'telemetry-trip-backfill-ingest');
    expect(backfill?.status).toBe(ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED);
    const reporting = summary.flows.find((f) => f.flowId === 'external-reporting-export');
    expect(reporting?.status).toBe(ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED);
  });

  it('sets ENFORCEMENT_ERROR when domain runtime health reports ERROR', () => {
    const errorHealth = {
      resolveDomainHealth: jest.fn().mockReturnValue(ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.ERROR),
      metricsSnapshot: jest.fn().mockReturnValue({}),
    } as unknown as EnforcementCoverageHealthService;
    const errorService = new EnforcementCoverageRegistryService(
      errorHealth,
      metrics,
      auditService as never,
    );
    const summary = errorService.evaluate('org-1', 'corr-error');
    expect(summary.enforcementErrorCount).toBeGreaterThan(0);
    expect(summary.flows.every((f) => f.status === ENFORCEMENT_COVERAGE_STATUS.ENFORCEMENT_ERROR)).toBe(
      true,
    );
  });

  it('missing tests prevent ENFORCED status', () => {
    const summary = service.evaluate('org-1', 'corr-tests');
    for (const row of summary.flows) {
      if (row.testStatus === ENFORCEMENT_COVERAGE_TEST_STATUS.MISSING) {
        expect(row.status).not.toBe(ENFORCEMENT_COVERAGE_STATUS.ENFORCED);
      }
    }
  });

  it('audits status changes without secrets', () => {
    service.evaluate('org-1', 'corr-audit-1');
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
    const payload = auditService.recordIngestionSkipped.mock.calls[0][0];
    expect(payload.ingestionPath).toMatch(/^enforcement-coverage:/);
    expect(payload.dataCategory).toBe('ENFORCEMENT_COVERAGE');
  });

  it('validateRegistryIntegrity passes for current catalog', () => {
    const result = service.validateRegistryIntegrity();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
