import { Injectable } from '@nestjs/common';
import {
  EvaluationsFinanceService,
  EVALUATIONS_FINANCE_METRIC_IDS,
} from '@modules/evaluations-finance/evaluations-finance.service';
import { requireEvaluationsMetricDefinition } from '@modules/evaluations-metrics';
import {
  buildPartialEvaluationsMetric,
  buildUnavailableEvaluationsMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import type {
  EvaluationsMetricResponse,
  EvaluationsMetricStatus,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsInsightsRepository, type E4SourceWindow } from './evaluations-insights.repository';
import {
  E4_CALCULATION_VERSIONS,
  E4_DRIVER_ANALYSIS_DISCLAIMER,
  type EvaluationsAnalyticsInsightsSummary,
  type EvaluationsCostModelSection,
  type EvaluationsDriverInfluenceSection,
  type EvaluationsInsightsScope,
  type EvaluationsStrengthSection,
  type EvaluationsUtilizationSection,
  type EvaluationsWeaknessSection,
  type E4CostCategoryResult,
  type E4SkippedDimension,
} from './contracts/evaluations-insights.contract';
import { aggregateCostEvents } from './domain/evaluations-cost.domain';
import { computeUtilization } from './domain/evaluations-utilization.domain';
import {
  detectStrengths,
  detectWeaknesses,
  reconcileDetections,
  type E4DetectionSignals,
} from './domain/evaluations-detection.domain';
import {
  computeDriverInfluence,
  E4_DEFAULT_DRIVER_CONFIG,
} from './domain/evaluations-driver.domain';
import { EvaluationsPrivacyResolver } from '../privacy/evaluations-privacy.resolver';
import {
  canAccessPersonLevel,
  canRevealPersonIdentity,
  pseudonymizePersonRef,
} from '../privacy/evaluations-privacy.policy';
import { getEvaluationsPseudonymSecret } from '../privacy/evaluations-privacy.config';
import { EvaluationsAuditService } from '../audit/evaluations-audit.service';

const COST_FORMULAE: Readonly<Record<string, string>> = {
  OPERATING_EXPENSES:
    'SUM(incoming invoice totalCents) where expense-included status; attributed by invoiceDate ?? createdAt',
  UNPLANNED_MAINTENANCE:
    'SUM(ServiceCase.actualCostCents) where category in (REPAIR,DIAGNOSTIC) and status COMPLETED; attributed by completedAt',
  DAMAGE_REPAIR:
    'SUM(VehicleDamage.repairCostCents) where status REPAIRED; attributed by repairedAt',
  ESTIMATED_FIXED_COSTS:
    'UNSUPPORTED on current main: per-vehicle leasing/insurance/tax have no proven currency, periodicity, or effective-date/version → excluded from the authoritative total (no fabricated accrual)',
};

const COST_SOURCES: Readonly<Record<string, readonly string[]>> = {
  OPERATING_EXPENSES: ['OrgInvoice(INCOMING)'],
  UNPLANNED_MAINTENANCE: ['ServiceCase'],
  DAMAGE_REPAIR: ['VehicleDamage'],
  ESTIMATED_FIXED_COSTS: ['Vehicle.leasingRateCents/insuranceCostCents/taxCostCents'],
};

interface E4DetectionContext {
  readonly utilization: EvaluationsUtilizationSection;
  readonly finance: { status: EvaluationsMetricStatus; metrics: Readonly<Record<string, EvaluationsMetricResponse>>; reason: string | null };
  readonly signals: E4DetectionSignals;
  /** Configured analytical dimensions that were evaluated (source AVAILABLE). */
  readonly evaluatedDimensions: readonly string[];
  /** Configured dimensions skipped because their source was not authoritative. */
  readonly skippedDimensions: readonly E4SkippedDimension[];
}

/**
 * The single canonical E4 analytics orchestration authority.
 *
 * It reuses the E2 authorized scope (org + station + period + timezone) verbatim,
 * delegates all Finance to the E3 canonical service, and composes tenant-scoped
 * capability sections through pure deterministic domain builders. It never forks
 * the period/scope/money/finance authorities and never fabricates a zero for
 * missing evidence.
 */
@Injectable()
export class EvaluationsInsightsService {
  constructor(
    private readonly finance: EvaluationsFinanceService,
    private readonly repository: EvaluationsInsightsRepository,
    private readonly privacy: EvaluationsPrivacyResolver,
    private readonly audit: EvaluationsAuditService,
  ) {}

  async getSummary(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    now?: Date,
  ): Promise<EvaluationsAnalyticsInsightsSummary> {
    const generatedAt = now ?? new Date();

    // Each section is isolated: a failure or lack of evidence in one must never
    // force valid unrelated sections to zero (STEP 10). A processing failure
    // yields an ERROR section, never a fabricated value.
    const finance = await isolateAsync(
      async () =>
        this.buildFinanceSection(
          (
            await this.finance.computeFinancialInsights({
              actor,
              orgId: scope.organizationId,
              requestedStationIds: scope.stationScoped ? [...(scope.stationIds ?? [])] : null,
              reference: new Date(scope.period.reference),
              now: generatedAt,
            })
          ).metrics,
        ),
      () => ({ status: 'ERROR' as const, metrics: {}, reason: 'FINANCE_SECTION_ERROR' }),
    );

    const costModel = await isolateAsync(
      () => this.getCostModel(scope, generatedAt),
      () => this.errorCostSection(scope, generatedAt),
    );
    const utilization = await isolateAsync(
      () => this.getUtilization(scope, generatedAt),
      () => this.errorUtilizationSection(scope, generatedAt),
    );
    const context = await isolateAsync(
      () => this.buildDetectionContext(scope, generatedAt, { utilization, finance }),
      () => ({
        utilization,
        finance,
        signals: { utilization: null, finance: null, bookings: null },
        evaluatedDimensions: [],
        skippedDimensions: [{ dimension: 'ALL', reason: 'DETECTION_CONTEXT_ERROR' }],
      }),
    );
    const strengths = isolate(
      () => this.buildStrengthSection(scope, generatedAt, context),
      () => this.errorStrengthSection(scope, generatedAt),
    );
    const weaknesses = isolate(
      () => this.buildWeaknessSection(scope, generatedAt, context),
      () => this.errorWeaknessSection(scope, generatedAt),
    );
    const driverInfluence = await isolateAsync(
      () => this.getDriverInfluence(scope, actor, generatedAt),
      () => this.errorDriverSection(scope, generatedAt),
    );

    return {
      schemaVersion: '1.0.0',
      generatedAt: generatedAt.toISOString(),
      scope: this.echoScope(scope),
      period: scope.period,
      calculationVersion: E4_CALCULATION_VERSIONS.summary,
      sections: {
        finance,
        costModel,
        utilization,
        strengths,
        weaknesses,
        driverInfluence,
      },
    };
  }

  async getCostModel(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
  ): Promise<EvaluationsCostModelSection> {
    const base = {
      calculationVersion: E4_CALCULATION_VERSIONS.costModel,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
    };

    // Cost sources have no authoritative station lineage; a station-narrowed
    // request must NOT receive org-wide totals — fail closed (no org fallback).
    if (scope.stationScoped) {
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: null,
        reason: 'COST_STATION_LINEAGE_UNAVAILABLE',
        categories: [],
        totalsByCurrency: [],
        reportingCurrency: null,
        mixedCurrency: false,
      };
    }

    const window = toWindow(scope);
    const reportingCurrency = await this.repository.resolveReportingCurrency(scope.organizationId);
    const [costEvents, unsupported] = await Promise.all([
      this.repository.loadCostEvents(scope.organizationId, window),
      this.repository.loadUnsupportedCostSources(scope.organizationId, window),
    ]);

    const aggregation = aggregateCostEvents(
      costEvents,
      Date.parse(scope.period.start),
      Date.parse(scope.period.endExclusive),
    );

    // Authoritative categories (invoices only — explicit per-row currency).
    const categories: E4CostCategoryResult[] = aggregation.categories.map((category) => ({
      category: category.category,
      nature: category.nature,
      status: 'AVAILABLE',
      totalsByCurrency: category.totalsByCurrency,
      eventCount: category.eventCount,
      formula: COST_FORMULAE[category.category] ?? '',
      sources: COST_SOURCES[category.category] ?? [],
      reason: null,
    }));

    // Structurally unsupported categories: source records exist in the period but
    // lack proven currency (ServiceCase/Damage) or proven periodicity + effective-
    // date (fixed costs). They are reported as UNAVAILABLE with an explicit
    // reason — never denominated in the current reporting currency, never accrued
    // with a fake 30-day month, never a false zero.
    const unsupportedCategories: E4CostCategoryResult[] = [];
    const addUnsupported = (
      category: E4CostCategoryResult['category'],
      nature: E4CostCategoryResult['nature'],
      count: number,
      reason: string,
    ) => {
      if (count <= 0) return;
      unsupportedCategories.push({
        category,
        nature,
        status: 'UNAVAILABLE',
        totalsByCurrency: [],
        eventCount: count,
        formula: COST_FORMULAE[category] ?? '',
        sources: COST_SOURCES[category] ?? [],
        reason,
      });
    };
    addUnsupported(
      'UNPLANNED_MAINTENANCE',
      'ACTUAL',
      unsupported.serviceCaseCount,
      'SERVICECASE_COST_CURRENCY_UNPROVEN',
    );
    addUnsupported(
      'DAMAGE_REPAIR',
      'ACTUAL',
      unsupported.damageCount,
      'DAMAGE_COST_CURRENCY_UNPROVEN',
    );
    addUnsupported(
      'ESTIMATED_FIXED_COSTS',
      'ESTIMATED',
      unsupported.fixedConfigVehicleCount,
      'FIXED_COST_PERIODICITY_AND_HISTORY_UNPROVEN',
    );

    const allCategories = [...categories, ...unsupportedCategories];
    if (allCategories.length === 0) {
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: {
          expectedRecords: unsupported.vehicleCount,
          availableRecords: 0,
          excludedRecords: null,
          ratio: null,
          missingSources: ['NO_COST_SOURCE'],
        },
        reason: 'NO_COST_SOURCE',
        categories: [],
        totalsByCurrency: [],
        reportingCurrency,
        mixedCurrency: false,
      };
    }

    const mixedCurrency = aggregation.currencies.length > 1;
    const hasUnsupported = unsupportedCategories.length > 0;
    const hasAuthoritative = categories.length > 0;

    let status: EvaluationsMetricStatus;
    let reason: string | null;
    if (!hasAuthoritative) {
      // Only unsupported sources exist → no authoritative Money can be produced.
      status = 'UNAVAILABLE';
      reason = 'COST_SOURCES_UNSUPPORTED';
    } else if (mixedCurrency) {
      status = 'PARTIAL';
      reason = 'MIXED_CURRENCY_SEGMENTED';
    } else if (hasUnsupported) {
      status = 'PARTIAL';
      reason = 'COST_MODEL_INCOMPLETE_UNSUPPORTED_CATEGORIES';
    } else {
      status = 'AVAILABLE';
      reason = null;
    }

    return {
      ...base,
      status,
      coverage: {
        expectedRecords: unsupported.vehicleCount,
        availableRecords: aggregation.categories.reduce((sum, c) => sum + c.eventCount, 0),
        excludedRecords:
          unsupported.serviceCaseCount + unsupported.damageCount + unsupported.fixedConfigVehicleCount,
        ratio: null,
        missingSources: unsupportedCategories.map((c) => c.reason as string),
      },
      reason,
      categories: allCategories,
      totalsByCurrency: aggregation.totalsByCurrency,
      reportingCurrency,
      mixedCurrency,
    };
  }

  async getUtilization(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
  ): Promise<EvaluationsUtilizationSection> {
    const metricId = 'ops.fleet_utilization_pct';
    const definition = requireEvaluationsMetricDefinition(metricId);
    const base = {
      calculationVersion: E4_CALCULATION_VERSIONS.utilization,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
      occupancyBasis: 'SCHEDULED' as const,
    };

    // `latestState.online` is a CURRENT snapshot, not a historical telemetry
    // lineage. Only surface it for a live/current period (the period still
    // includes "now"); for a historical period it is never a period fact.
    const isCurrentPeriod = generatedAt.getTime() < Date.parse(scope.period.endExclusive);

    const unavailableMetric = (reason: string): EvaluationsMetricResponse =>
      buildUnavailableEvaluationsMetric({
        metricId,
        metricKind: definition.metricKind,
        calculationVersion: definition.calculationVersion,
        period: scope.period,
        generatedAt,
        valueType: 'PERCENT',
        unit: 'PERCENT',
        reason,
      });

    // A fully unknown (not observed) section: every analytical quantity is null,
    // never a synthetic zero. `blockedMs` is null by construction (no source).
    const unknownFields = {
      capacityMs: null,
      rentedMs: null,
      maintenanceMs: null,
      blockedMs: null,
      netCapacityMs: null,
      eligibleVehicles: null,
      overlappingBookingPairs: null,
      telemetryOfflineVehicles: null,
      telemetrySnapshotAsOf: null,
    };

    // Station-scoped historical utilization needs a continuous vehicle→station
    // history that does not exist on current main → fail closed (never apply the
    // current station retroactively, never emit false zeros).
    if (scope.stationScoped) {
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: null,
        reason: 'STATION_UTILIZATION_HISTORY_UNAVAILABLE',
        utilizationPercent: unavailableMetric('STATION_UTILIZATION_HISTORY_UNAVAILABLE'),
        ...unknownFields,
      };
    }

    const window = toWindow(scope);
    const facts = await this.repository.loadUtilizationFacts(scope.organizationId, window);
    const result = computeUtilization(
      facts.vehicles,
      Date.parse(scope.period.start),
      Date.parse(scope.period.endExclusive),
    );

    const hasDenominator = result.netCapacityMs > 0 && result.eligibleVehicles > 0;
    const coverageRatio =
      facts.vehicleCount > 0 ? result.eligibleVehicles / facts.vehicleCount : null;

    // Missing lineage that structurally limits this metric on current main:
    // scheduled occupancy is not actual possession, vehicle eligibility history
    // is not tracked, and there is no authoritative blocked-interval source.
    const missingSources = [
      'SCHEDULED_OCCUPANCY_NOT_ACTUAL',
      'VEHICLE_ELIGIBILITY_HISTORY',
      'BLOCKED_HISTORY',
    ];

    if (!hasDenominator) {
      // No net capacity to divide by → no percentage can be observed.
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: {
          expectedRecords: facts.vehicleCount,
          availableRecords: result.eligibleVehicles,
          excludedRecords: facts.vehicleCount - result.eligibleVehicles,
          ratio: coverageRatio,
          missingSources,
        },
        reason: 'UTILIZATION_DENOMINATOR_ZERO',
        utilizationPercent: unavailableMetric('UTILIZATION_DENOMINATOR_ZERO'),
        // These were genuinely observed from real intervals (real measurements).
        capacityMs: result.capacityMs,
        rentedMs: result.rentedMs,
        maintenanceMs: result.maintenanceMs,
        blockedMs: null, // unknown: no authoritative blocked source
        netCapacityMs: result.netCapacityMs,
        eligibleVehicles: result.eligibleVehicles,
        overlappingBookingPairs: result.overlappingBookingPairs,
        telemetryOfflineVehicles: isCurrentPeriod ? facts.telemetryOfflineVehicles : null,
        telemetrySnapshotAsOf: isCurrentPeriod ? generatedAt.toISOString() : null,
      };
    }

    // The metric is always coverage-limited (scheduled occupancy, approximate
    // eligibility, unknown blocked time) → PARTIAL, never AVAILABLE. E1 PARTIAL
    // permits a value alongside coverage.
    const coverage = {
      expectedRecords: facts.vehicleCount,
      availableRecords: result.eligibleVehicles,
      excludedRecords: facts.vehicleCount - result.eligibleVehicles,
      ratio: coverageRatio,
      missingSources,
    };
    const utilizationPercent = buildPartialEvaluationsMetric({
      metricId,
      metricKind: definition.metricKind,
      calculationVersion: definition.calculationVersion,
      period: scope.period,
      generatedAt,
      valueType: 'PERCENT',
      unit: 'PERCENT',
      value: (result.utilizationRatio as number) * 100,
      dataCoverage: coverage,
    });

    return {
      ...base,
      status: 'PARTIAL',
      coverage,
      reason: 'COVERAGE_LIMITED_SCHEDULED_OCCUPANCY',
      utilizationPercent,
      capacityMs: result.capacityMs,
      rentedMs: result.rentedMs,
      maintenanceMs: result.maintenanceMs,
      blockedMs: null, // unknown: no authoritative blocked source (never synthetic 0)
      netCapacityMs: result.netCapacityMs,
      eligibleVehicles: result.eligibleVehicles,
      overlappingBookingPairs: result.overlappingBookingPairs,
      telemetryOfflineVehicles: isCurrentPeriod ? facts.telemetryOfflineVehicles : null,
      telemetrySnapshotAsOf: isCurrentPeriod ? generatedAt.toISOString() : null,
    };
  }

  async getStrengths(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    now?: Date,
  ): Promise<EvaluationsStrengthSection> {
    const generatedAt = now ?? new Date();
    const finance = this.buildFinanceSection(
      (
        await this.finance.computeFinancialInsights({
          actor,
          orgId: scope.organizationId,
          requestedStationIds: scope.stationScoped ? [...(scope.stationIds ?? [])] : null,
          reference: new Date(scope.period.reference),
          now: generatedAt,
        })
      ).metrics,
    );
    const utilization = await this.getUtilization(scope, generatedAt);
    const context = await this.buildDetectionContext(scope, generatedAt, { utilization, finance });
    return this.buildStrengthSection(scope, generatedAt, context);
  }

  async getWeaknesses(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    now?: Date,
  ): Promise<EvaluationsWeaknessSection> {
    const generatedAt = now ?? new Date();
    const finance = this.buildFinanceSection(
      (
        await this.finance.computeFinancialInsights({
          actor,
          orgId: scope.organizationId,
          requestedStationIds: scope.stationScoped ? [...(scope.stationIds ?? [])] : null,
          reference: new Date(scope.period.reference),
          now: generatedAt,
        })
      ).metrics,
    );
    const utilization = await this.getUtilization(scope, generatedAt);
    const context = await this.buildDetectionContext(scope, generatedAt, { utilization, finance });
    return this.buildWeaknessSection(scope, generatedAt, context);
  }

  async getDriverInfluence(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    generatedAt: Date,
  ): Promise<EvaluationsDriverInfluenceSection> {
    // E5B: driver influence is person-level data. Resolve the server-side PII
    // tier before emitting any driver reference (frontend hiding is never authz).
    const piiTier = await this.privacy.resolvePiiTier(actor, scope.organizationId);

    const base = {
      calculationVersion: E4_CALCULATION_VERSIONS.driverInfluence,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
      disclaimer: E4_DRIVER_ANALYSIS_DISCLAIMER,
      confounders: [
        'Seasonality and external demand shifts',
        'Fleet composition changes within the period',
        'Station transfer effects (incomplete station history)',
        'Correlated service cases and vehicle-level factors',
      ],
      piiTier,
    };

    // Person-level access denied → fail closed with no factors or references, and
    // record the denied outcome honestly (E5C, no PII).
    if (!canAccessPersonLevel(piiTier)) {
      await this.audit.recordPersonLevelAccess({
        organizationId: scope.organizationId,
        actorUserId: actor.id ?? null,
        result: 'DENIED',
        piiTier,
        stationScoped: scope.stationScoped,
        factorCount: 0,
        calculationVersion: E4_CALCULATION_VERSIONS.driverInfluence,
      });
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: null,
        reason: 'PERSON_LEVEL_ACCESS_DENIED',
        factors: [],
      };
    }

    // Driver-level facts have no authoritative station lineage; a station-scoped
    // parent request cannot be honestly narrowed → fail closed (scope matches).
    // Access was authorized (tier ok) but yields no person data → record SUCCEEDED.
    if (scope.stationScoped) {
      await this.audit.recordPersonLevelAccess({
        organizationId: scope.organizationId,
        actorUserId: actor.id ?? null,
        result: 'SUCCEEDED',
        piiTier,
        stationScoped: true,
        factorCount: 0,
        calculationVersion: E4_CALCULATION_VERSIONS.driverInfluence,
      });
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: null,
        reason: 'STATION_DRIVER_LINEAGE_UNAVAILABLE',
        factors: [],
      };
    }

    const window = toWindow(scope);
    const { observations, unattributedCount } = await this.repository.loadDriverObservations(
      scope.organizationId,
      window,
    );
    const influence = computeDriverInfluence(observations, E4_DEFAULT_DRIVER_CONFIG);

    // Field-level exposure: only a `full` tier may reveal raw driver identity;
    // a `pseudonymous` tier receives keyed, non-reversible pseudonyms.
    const revealIdentity = canRevealPersonIdentity(piiTier);
    const pseudonymSecret = getEvaluationsPseudonymSecret();
    const factors = influence.factors.map((factor) =>
      revealIdentity
        ? factor
        : {
            ...factor,
            driverRef: pseudonymizePersonRef({
              organizationId: scope.organizationId,
              personId: factor.driverRef,
              secret: pseudonymSecret,
            }),
          },
    );

    const status: EvaluationsMetricStatus =
      influence.dimensionsAnalyzed.length === 0 ? 'UNAVAILABLE' : 'AVAILABLE';

    if (factors.length > 0) {
      // Audit-critical: durable evidence of the person-level disclosure MUST
      // persist before the data is released. If the canonical audit cannot
      // durably record it, fail closed (no person data) rather than logging.
      try {
        await this.audit.recordCriticalPersonLevelDisclosure({
          organizationId: scope.organizationId,
          actorUserId: actor.id ?? null,
          result: 'SUCCEEDED',
          piiTier,
          stationScoped: false,
          factorCount: factors.length,
          calculationVersion: E4_CALCULATION_VERSIONS.driverInfluence,
        });
      } catch {
        return {
          ...base,
          status: 'UNAVAILABLE',
          coverage: null,
          reason: 'SENSITIVE_AUDIT_UNAVAILABLE',
          factors: [],
        };
      }
    } else {
      // Authorized, but no person data disclosed → best-effort audit only.
      await this.audit.recordPersonLevelAccess({
        organizationId: scope.organizationId,
        actorUserId: actor.id ?? null,
        result: 'SUCCEEDED',
        piiTier,
        stationScoped: false,
        factorCount: 0,
        calculationVersion: E4_CALCULATION_VERSIONS.driverInfluence,
      });
    }

    return {
      ...base,
      status,
      coverage: {
        expectedRecords: null,
        availableRecords: influence.factors.length,
        // Unattributed events are surfaced for transparency and are never
        // redistributed to named drivers.
        excludedRecords: unattributedCount,
        ratio: null,
        missingSources: influence.dimensionsSkippedInsufficient,
      },
      reason: status === 'UNAVAILABLE' ? 'DRIVER_EVIDENCE_INSUFFICIENT' : null,
      factors,
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async buildDetectionContext(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
    parts: {
      utilization: EvaluationsUtilizationSection;
      finance: E4DetectionContext['finance'];
    },
  ): Promise<E4DetectionContext> {
    const { utilization, finance } = parts;
    const evaluated: string[] = [];
    const skipped: E4SkippedDimension[] = [];

    // FINANCE dimension — evaluated only when the E3 finance source is AVAILABLE.
    // A PARTIAL/UNAVAILABLE finance source can never become fully AVAILABLE
    // detection evidence.
    const financeSignal =
      finance.status === 'AVAILABLE' ? this.extractFinanceSignal(finance.metrics) : null;
    if (finance.status === 'AVAILABLE') {
      evaluated.push('FINANCE');
    } else {
      skipped.push({ dimension: 'FINANCE', reason: `FINANCE_SOURCE_${finance.status}` });
    }

    // UTILIZATION dimension — evaluated only when the utilization source is fully
    // AVAILABLE. On current main utilization is structurally coverage-limited
    // (PARTIAL), so this dimension is skipped rather than treated as authoritative.
    let utilizationSignal: E4DetectionSignals['utilization'] = null;
    if (
      utilization.status === 'AVAILABLE' &&
      utilization.netCapacityMs !== null &&
      utilization.netCapacityMs > 0 &&
      utilization.rentedMs !== null &&
      utilization.eligibleVehicles !== null
    ) {
      utilizationSignal = {
        ratio: utilization.rentedMs / utilization.netCapacityMs,
        previousRatio: null,
        eligibleVehicles: utilization.eligibleVehicles,
        coverageRatio: utilization.coverage?.ratio ?? null,
      };
      evaluated.push('UTILIZATION');
    } else {
      skipped.push({
        dimension: 'UTILIZATION',
        reason:
          utilization.status === 'PARTIAL'
            ? 'UTILIZATION_SOURCE_PARTIAL'
            : `UTILIZATION_SOURCE_${utilization.status}`,
      });
    }

    // BOOKINGS dimension — source computable only for an org-wide request (no
    // station lineage). Station scope skips it.
    let bookingSignal: E4DetectionSignals['bookings'] = null;
    if (!scope.stationScoped) {
      evaluated.push('BOOKINGS');
      const outcomes = await this.repository.loadBookingOutcomes(
        scope.organizationId,
        toWindow(scope),
      );
      bookingSignal =
        outcomes.totalOutcomes > 0
          ? {
              cancelledPlusNoShow: outcomes.cancelledPlusNoShow,
              totalOutcomes: outcomes.totalOutcomes,
            }
          : null;
    } else {
      skipped.push({ dimension: 'BOOKINGS', reason: 'BOOKINGS_STATION_SCOPE_UNSUPPORTED' });
    }

    return {
      utilization,
      finance,
      signals: {
        utilization: utilizationSignal,
        finance: financeSignal,
        bookings: bookingSignal,
      },
      evaluatedDimensions: evaluated,
      skippedDimensions: skipped,
    };
  }

  private buildStrengthSection(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
    context: E4DetectionContext,
  ): EvaluationsStrengthSection {
    const base = {
      calculationVersion: E4_CALCULATION_VERSIONS.strengthDetection,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
    };
    const roll = this.detectionCoverage(context);
    if (roll.status === 'UNAVAILABLE') {
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: roll.coverage,
        reason: 'DETECTION_EVIDENCE_UNAVAILABLE',
        strengths: [],
        evaluatedDimensions: context.evaluatedDimensions,
        skippedDimensions: context.skippedDimensions,
      };
    }
    const strengths = detectStrengths(context.signals);
    const weaknesses = detectWeaknesses(context.signals);
    const reconciled = reconcileDetections(strengths, weaknesses);
    return {
      ...base,
      status: roll.status,
      coverage: roll.coverage,
      reason: roll.reason,
      strengths: reconciled.strengths,
      evaluatedDimensions: context.evaluatedDimensions,
      skippedDimensions: context.skippedDimensions,
    };
  }

  private buildWeaknessSection(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
    context: E4DetectionContext,
  ): EvaluationsWeaknessSection {
    const base = {
      calculationVersion: E4_CALCULATION_VERSIONS.weaknessDetection,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
    };
    const roll = this.detectionCoverage(context);
    if (roll.status === 'UNAVAILABLE') {
      return {
        ...base,
        status: 'UNAVAILABLE',
        coverage: roll.coverage,
        reason: 'DETECTION_EVIDENCE_UNAVAILABLE',
        weaknesses: [],
        evaluatedDimensions: context.evaluatedDimensions,
        skippedDimensions: context.skippedDimensions,
      };
    }
    const strengths = detectStrengths(context.signals);
    const weaknesses = detectWeaknesses(context.signals);
    const reconciled = reconcileDetections(strengths, weaknesses);
    return {
      ...base,
      status: roll.status,
      coverage: roll.coverage,
      reason: roll.reason,
      weaknesses: reconciled.weaknesses,
      evaluatedDimensions: context.evaluatedDimensions,
      skippedDimensions: context.skippedDimensions,
    };
  }

  /**
   * Truthful detection-section coverage roll-up:
   *  - no dimension evaluable → UNAVAILABLE,
   *  - one or more configured dimensions skipped → PARTIAL (an empty result must
   *    never imply "everything was checked"),
   *  - all configured dimensions evaluated → AVAILABLE.
   */
  private detectionCoverage(context: E4DetectionContext): {
    status: EvaluationsMetricStatus;
    coverage: EvaluationsUtilizationSection['coverage'];
    reason: string | null;
  } {
    const evaluated = context.evaluatedDimensions.length;
    const skipped = context.skippedDimensions.length;
    const total = evaluated + skipped;
    const coverage = {
      expectedRecords: total,
      availableRecords: evaluated,
      excludedRecords: skipped,
      ratio: total > 0 ? evaluated / total : null,
      missingSources: context.skippedDimensions.map((s) => s.reason),
    };
    if (evaluated === 0) {
      return { status: 'UNAVAILABLE', coverage, reason: 'DETECTION_EVIDENCE_UNAVAILABLE' };
    }
    if (skipped > 0) {
      return { status: 'PARTIAL', coverage, reason: 'DETECTION_COVERAGE_INCOMPLETE' };
    }
    return { status: 'AVAILABLE', coverage, reason: null };
  }

  private extractFinanceSignal(
    metrics: Readonly<Record<string, EvaluationsMetricResponse>>,
  ): E4DetectionSignals['finance'] {
    const revenue = metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    const margin = metrics[EVALUATIONS_FINANCE_METRIC_IDS.profitMargin];
    const revenueAvailable = revenue && revenue.status === 'AVAILABLE' && revenue.value !== null;
    const marginAvailable = margin && margin.status === 'AVAILABLE' && margin.value !== null;
    if (!revenueAvailable && !marginAvailable) return null;

    const revenueMinor =
      revenueAvailable && typeof (revenue.value as { amountMinor?: number }).amountMinor === 'number'
        ? (revenue.value as { amountMinor: number }).amountMinor
        : null;
    const previousRevenueMinor =
      revenueAvailable && revenue.comparison && revenue.comparison.status === 'AVAILABLE'
        ? (revenueMinor ?? 0) - (revenue.comparison.absoluteDelta ?? 0)
        : null;
    const marginPercent =
      marginAvailable && typeof margin.value === 'number' ? (margin.value as number) : null;

    return { marginPercent, revenueMinor, previousRevenueMinor };
  }

  private buildFinanceSection(
    metrics: Readonly<Record<string, EvaluationsMetricResponse>>,
  ): E4DetectionContext['finance'] {
    const statuses = Object.values(metrics).map((metric) => metric.status);
    const status = rollupStatus(statuses);
    const reason =
      status === 'UNAVAILABLE'
        ? (Object.values(metrics)[0]?.warnings?.[0] ?? 'FINANCE_UNAVAILABLE')
        : null;
    return { status, metrics, reason };
  }

  private echoScope(scope: EvaluationsAuthorizedAnalyticsScope): EvaluationsInsightsScope {
    return {
      organizationId: scope.organizationId,
      stationIds: scope.stationIds,
      stationScoped: scope.stationScoped,
    };
  }

  private sectionBase(scope: EvaluationsAuthorizedAnalyticsScope, generatedAt: Date, calculationVersion: string) {
    return {
      calculationVersion,
      period: scope.period,
      scope: this.echoScope(scope),
      generatedAt: generatedAt.toISOString(),
    };
  }

  private errorCostSection(scope: EvaluationsAuthorizedAnalyticsScope, generatedAt: Date): EvaluationsCostModelSection {
    return {
      ...this.sectionBase(scope, generatedAt, E4_CALCULATION_VERSIONS.costModel),
      status: 'ERROR',
      coverage: null,
      reason: 'COST_SECTION_ERROR',
      categories: [],
      totalsByCurrency: [],
      reportingCurrency: null,
      mixedCurrency: false,
    };
  }

  private errorUtilizationSection(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
  ): EvaluationsUtilizationSection {
    const definition = requireEvaluationsMetricDefinition('ops.fleet_utilization_pct');
    return {
      ...this.sectionBase(scope, generatedAt, E4_CALCULATION_VERSIONS.utilization),
      status: 'ERROR',
      occupancyBasis: 'SCHEDULED',
      coverage: null,
      reason: 'UTILIZATION_SECTION_ERROR',
      utilizationPercent: buildUnavailableEvaluationsMetric({
        metricId: 'ops.fleet_utilization_pct',
        metricKind: definition.metricKind,
        calculationVersion: definition.calculationVersion,
        period: scope.period,
        generatedAt,
        valueType: 'PERCENT',
        unit: 'PERCENT',
        reason: 'UTILIZATION_SECTION_ERROR',
      }),
      // ERROR ≠ empty fleet: nothing was observed → all null, never synthetic 0.
      capacityMs: null,
      rentedMs: null,
      maintenanceMs: null,
      blockedMs: null,
      netCapacityMs: null,
      eligibleVehicles: null,
      overlappingBookingPairs: null,
      telemetryOfflineVehicles: null,
      telemetrySnapshotAsOf: null,
    };
  }

  private errorStrengthSection(scope: EvaluationsAuthorizedAnalyticsScope, generatedAt: Date): EvaluationsStrengthSection {
    return {
      ...this.sectionBase(scope, generatedAt, E4_CALCULATION_VERSIONS.strengthDetection),
      status: 'ERROR',
      coverage: null,
      reason: 'STRENGTH_SECTION_ERROR',
      strengths: [],
      evaluatedDimensions: [],
      skippedDimensions: [],
    };
  }

  private errorWeaknessSection(scope: EvaluationsAuthorizedAnalyticsScope, generatedAt: Date): EvaluationsWeaknessSection {
    return {
      ...this.sectionBase(scope, generatedAt, E4_CALCULATION_VERSIONS.weaknessDetection),
      status: 'ERROR',
      coverage: null,
      reason: 'WEAKNESS_SECTION_ERROR',
      weaknesses: [],
      evaluatedDimensions: [],
      skippedDimensions: [],
    };
  }

  private errorDriverSection(
    scope: EvaluationsAuthorizedAnalyticsScope,
    generatedAt: Date,
  ): EvaluationsDriverInfluenceSection {
    return {
      ...this.sectionBase(scope, generatedAt, E4_CALCULATION_VERSIONS.driverInfluence),
      status: 'ERROR',
      coverage: null,
      reason: 'DRIVER_SECTION_ERROR',
      disclaimer: E4_DRIVER_ANALYSIS_DISCLAIMER,
      confounders: [],
      factors: [],
      piiTier: 'none',
    };
  }
}

async function isolateAsync<T>(build: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await build();
  } catch {
    return fallback();
  }
}

function isolate<T>(build: () => T, fallback: () => T): T {
  try {
    return build();
  } catch {
    return fallback();
  }
}

function toWindow(scope: EvaluationsAuthorizedAnalyticsScope): E4SourceWindow {
  return {
    start: new Date(scope.period.start),
    endExclusive: new Date(scope.period.endExclusive),
  };
}

function rollupStatus(statuses: readonly EvaluationsMetricStatus[]): EvaluationsMetricStatus {
  if (statuses.length === 0) return 'UNAVAILABLE';
  const hasAvailable = statuses.some((status) => status === 'AVAILABLE' || status === 'PARTIAL' || status === 'STALE');
  const hasUnavailable = statuses.some(
    (status) => status === 'UNAVAILABLE' || status === 'ERROR' || status === 'NOT_APPLICABLE',
  );
  if (hasAvailable && !hasUnavailable) return 'AVAILABLE';
  if (hasAvailable && hasUnavailable) return 'PARTIAL';
  if (statuses.some((status) => status === 'ERROR')) return 'ERROR';
  return 'UNAVAILABLE';
}
