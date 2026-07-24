import { Injectable, Logger } from '@nestjs/common';
import {
  ENFORCEMENT_COVERAGE_RUNTIME_HEALTH,
  ENFORCEMENT_COVERAGE_STATUS,
  ENFORCEMENT_COVERAGE_TEST_STATUS,
  ENFORCEMENT_POINT,
  type EnforcementCoverageStatus,
} from './enforcement-coverage-registry.constants';
import {
  ENFORCEMENT_COVERAGE_CATALOG,
  getProductiveProcessingPaths,
} from './enforcement-coverage-catalog';
import { EnforcementCoverageHealthService } from './enforcement-coverage-health.service';
import { EnforcementCoverageRegistryMetricsService } from './enforcement-coverage-registry.metrics';
import {
  readBaselineFlowIds,
  resolveEnforcementCoverageVersion,
  testSpecExists,
} from './enforcement-coverage-version.util';
import type {
  EnforcementCoverageStatusChange,
  EnforcementCoverageSummary,
  EnforcementFlowCatalogEntry,
  EnforcementFlowCoverageRow,
} from './enforcement-coverage.types';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { POLICY_RESOLVER_SOURCE_SYSTEM } from '../policy-resolver/policy-resolver.constants';

function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

@Injectable()
export class EnforcementCoverageRegistryService {
  private readonly logger = new Logger(EnforcementCoverageRegistryService.name);
  private readonly lastStatusByFlow = new Map<string, EnforcementCoverageStatus>();

  constructor(
    private readonly healthService: EnforcementCoverageHealthService,
    private readonly metrics: EnforcementCoverageRegistryMetricsService,
    private readonly auditService: DataAuthorizationAuditService,
  ) {}

  evaluate(organizationId: string, correlationId: string): EnforcementCoverageSummary {
    const version = resolveEnforcementCoverageVersion();
    const evaluatedAt = new Date().toISOString();
    const unregistered = this.findUnregisteredProductivePaths();

    const flows = ENFORCEMENT_COVERAGE_CATALOG.map((entry) =>
      this.evaluateFlow(entry, organizationId, correlationId, evaluatedAt),
    );

    for (const row of flows) {
      this.metrics.record({
        domain: ENFORCEMENT_COVERAGE_CATALOG.find((e) => e.flowId === row.flowId)!.domain,
        outcome: this.outcomeFromStatus(row.status),
      });
    }

    const summary: EnforcementCoverageSummary = {
      coverageVersion: version.coverageVersion,
      gitCommit: version.gitCommit,
      buildVersion: version.buildVersion,
      evaluatedAt,
      totalFlows: flows.length,
      enforcedCount: flows.filter((f) => f.status === ENFORCEMENT_COVERAGE_STATUS.ENFORCED).length,
      partiallyEnforcedCount: flows.filter(
        (f) => f.status === ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED,
      ).length,
      notImplementedCount: flows.filter(
        (f) => f.status === ENFORCEMENT_COVERAGE_STATUS.NOT_IMPLEMENTED,
      ).length,
      enforcementErrorCount: flows.filter(
        (f) => f.status === ENFORCEMENT_COVERAGE_STATUS.ENFORCEMENT_ERROR,
      ).length,
      disabledCount: flows.filter((f) => f.status === ENFORCEMENT_COVERAGE_STATUS.DISABLED).length,
      fullyProtected: this.isFullyProtected(flows, unregistered),
      unregisteredProductivePaths: unregistered,
      flows,
    };

    return summary;
  }

  getRuntimeMetricsSnapshot(): Record<string, Record<string, number>> {
    return this.healthService.metricsSnapshot();
  }

  validateRegistryIntegrity(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const baselineIds = readBaselineFlowIds();
    const catalogIds = new Set(ENFORCEMENT_COVERAGE_CATALOG.map((row) => row.flowId));

    for (const flowId of baselineIds) {
      if (!catalogIds.has(flowId)) {
        errors.push(`Baseline flowId missing from catalog: ${flowId}`);
      }
    }

    const unregistered = this.findUnregisteredProductivePaths();
    for (const path of unregistered) {
      errors.push(`Unregistered productive processing path: ${path}`);
    }

    for (const entry of ENFORCEMENT_COVERAGE_CATALOG) {
      if (!testSpecExists(entry.testSpecPath)) {
        errors.push(`Missing test spec for flow ${entry.flowId}: ${entry.testSpecPath}`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  private evaluateFlow(
    entry: EnforcementFlowCatalogEntry,
    organizationId: string,
    correlationId: string,
    evaluatedAt: string,
  ): EnforcementFlowCoverageRow {
    const shadowModeActive = entry.shadowModeEnv
      ? parseBoolEnv(process.env[entry.shadowModeEnv], true)
      : false;
    const testStatus = this.resolveTestStatus(entry);
    const runtimeHealth = this.healthService.resolveDomainHealth(entry.domain);
    const missingEnforcementPoints = entry.requiredEnforcementPoints.filter(
      (point) => !entry.implementedEnforcementPoints.includes(point),
    );

    const status = this.resolveStatus({
      entry,
      missingEnforcementPoints,
      testStatus,
      runtimeHealth,
      shadowModeActive,
    });

    this.auditStatusChange(entry.flowId, status, organizationId, correlationId, evaluatedAt);

    return {
      flowId: entry.flowId,
      flowName: entry.flowName,
      sourceSystem: entry.sourceSystem,
      dataCategories: [...entry.dataCategories],
      actions: [...entry.actions],
      responsibleService: entry.responsibleService,
      responsibleOwner: entry.responsibleOwner,
      requiredEnforcementPoints: [...entry.requiredEnforcementPoints],
      implementedEnforcementPoints: [...entry.implementedEnforcementPoints],
      testStatus,
      runtimeHealth,
      lastVerifiedAt: evaluatedAt,
      status,
      shadowModeActive,
      missingEnforcementPoints,
    };
  }

  private resolveStatus(input: {
    entry: EnforcementFlowCatalogEntry;
    missingEnforcementPoints: string[];
    testStatus: EnforcementFlowCoverageRow['testStatus'];
    runtimeHealth: EnforcementFlowCoverageRow['runtimeHealth'];
    shadowModeActive: boolean;
  }): EnforcementCoverageStatus {
    if (input.entry.disabled) {
      return ENFORCEMENT_COVERAGE_STATUS.DISABLED;
    }
    if (input.runtimeHealth === ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.ERROR) {
      return ENFORCEMENT_COVERAGE_STATUS.ENFORCEMENT_ERROR;
    }
    if (input.entry.implementedEnforcementPoints.length === 0) {
      return ENFORCEMENT_COVERAGE_STATUS.NOT_IMPLEMENTED;
    }
    if (
      input.missingEnforcementPoints.length > 0 ||
      input.testStatus !== ENFORCEMENT_COVERAGE_TEST_STATUS.PASS ||
      input.shadowModeActive
    ) {
      return ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED;
    }
    return ENFORCEMENT_COVERAGE_STATUS.ENFORCED;
  }

  private resolveTestStatus(entry: EnforcementFlowCatalogEntry) {
    if (!entry.requiredEnforcementPoints.includes(ENFORCEMENT_POINT.UNIT_TEST_COVERAGE)) {
      return ENFORCEMENT_COVERAGE_TEST_STATUS.NOT_APPLICABLE;
    }
    return testSpecExists(entry.testSpecPath)
      ? ENFORCEMENT_COVERAGE_TEST_STATUS.PASS
      : ENFORCEMENT_COVERAGE_TEST_STATUS.MISSING;
  }

  private isFullyProtected(
    flows: EnforcementFlowCoverageRow[],
    unregistered: string[],
  ): boolean {
    if (unregistered.length > 0) return false;
    const productive = flows.filter(
      (f) =>
        ENFORCEMENT_COVERAGE_CATALOG.find((e) => e.flowId === f.flowId)?.productive &&
        !ENFORCEMENT_COVERAGE_CATALOG.find((e) => e.flowId === f.flowId)?.disabled,
    );
    return productive.every((f) => f.status === ENFORCEMENT_COVERAGE_STATUS.ENFORCED);
  }

  private findUnregisteredProductivePaths(): string[] {
    const registered = new Set(getProductiveProcessingPaths());
    const baselinePaths = readBaselineProcessingPathsFromBaseline();
    return baselinePaths.filter((path) => !registered.has(path));
  }

  private outcomeFromStatus(status: EnforcementCoverageStatus) {
    switch (status) {
      case ENFORCEMENT_COVERAGE_STATUS.ENFORCED:
        return 'enforced' as const;
      case ENFORCEMENT_COVERAGE_STATUS.PARTIALLY_ENFORCED:
        return 'partial' as const;
      case ENFORCEMENT_COVERAGE_STATUS.NOT_IMPLEMENTED:
        return 'not_implemented' as const;
      case ENFORCEMENT_COVERAGE_STATUS.ENFORCEMENT_ERROR:
        return 'error' as const;
      default:
        return 'evaluated' as const;
    }
  }

  private auditStatusChange(
    flowId: string,
    newStatus: EnforcementCoverageStatus,
    organizationId: string,
    correlationId: string,
    evaluatedAt: string,
  ): void {
    const previous = this.lastStatusByFlow.get(flowId) ?? null;
    if (previous === newStatus) return;

    this.lastStatusByFlow.set(flowId, newStatus);
    const change: EnforcementCoverageStatusChange = {
      flowId,
      previousStatus: previous,
      newStatus,
      correlationId,
      evaluatedAt,
    };

    void this.auditService
      .recordIngestionSkipped({
        organizationId,
        vehicleId: organizationId,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
        dataCategory: 'ENFORCEMENT_COVERAGE',
        purpose: 'TECHNICAL_OVERVIEW',
        ingestionPath: `enforcement-coverage:${flowId}`,
        serviceIdentity: 'synqdrive-enforcement-coverage-registry',
        correlationId,
        reasonCode: `COVERAGE_STATUS_${newStatus}`,
        reasonCodes: [
          previous ? `from:${previous}` : 'from:null',
          `to:${newStatus}`,
        ],
        policyVersion: null,
        matchedPolicyId: null,
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to audit coverage status change flow=${flowId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    this.logger.log(
      `Coverage status change flow=${flowId} ${previous ?? 'null'} -> ${newStatus} (${JSON.stringify(change)})`,
    );
  }
}

function readBaselineProcessingPathsFromBaseline(): string[] {
  const baselineIds = readBaselineFlowIds();
  return baselineIds
    .map((id) => ENFORCEMENT_COVERAGE_CATALOG.find((row) => row.flowId === id)?.processingPath)
    .filter((path): path is string => Boolean(path));
}
