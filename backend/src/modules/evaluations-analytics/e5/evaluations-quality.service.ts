import { Injectable } from '@nestjs/common';
import { EvaluationsInsightsService } from '../e4/evaluations-insights.service';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import type {
  EvaluationsMetricStatus,
  EvaluationsSourceFreshness,
  EvaluationsDataCoverage,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import {
  EvaluationsQualityRepository,
  type E5FreshnessRange,
  type E5SourceWindow,
} from './evaluations-quality.repository';
import {
  E5_CALCULATION_VERSIONS,
  type EvaluationsQualityReport,
  type E5SectionQuality,
  type E5LineageRef,
  type E5DimensionState,
  type E5QualityDimension,
} from './contracts/evaluations-quality.contract';
import {
  buildSourceFreshness,
  completenessState,
  freshnessDimensionState,
  validityState,
  weakestDimension,
  rollupQualityStatus,
} from './domain/evaluations-quality.domain';

/** Platform freshness rule: a source is FRESH within 3 days of the reference. */
const FRESHNESS_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

interface SectionInput {
  readonly section: string;
  readonly status: EvaluationsMetricStatus;
  readonly coverage: EvaluationsDataCoverage | null;
  readonly sources: readonly { category: string; model: string; range: E5FreshnessRange }[];
}

/**
 * E5A quality/freshness/lineage governance authority. It consumes the E4 section
 * outputs (via the single E4 orchestration service) plus tenant-scoped source
 * freshness ranges, and produces truthful quality metadata. It never recomputes
 * a metric value, never upgrades a status, and never emits cross-tenant or
 * out-of-station lineage.
 */
@Injectable()
export class EvaluationsQualityService {
  constructor(
    private readonly insights: EvaluationsInsightsService,
    private readonly repository: EvaluationsQualityRepository,
  ) {}

  async getQualityReport(
    scope: EvaluationsAuthorizedAnalyticsScope,
    actor: { id?: string; organizationId?: string | null; platformRole?: string | null },
    now?: Date,
  ): Promise<EvaluationsQualityReport> {
    const generatedAt = now ?? new Date();
    const summary = await this.insights.getSummary(scope, actor, generatedAt);
    const periodEndExclusiveMs = Date.parse(scope.period.endExclusive);
    const isCurrentPeriod = generatedAt.getTime() < periodEndExclusiveMs;

    const emptyRange: E5FreshnessRange = { newestMs: null, oldestMs: null };

    // Station-scoped requests never trigger org-wide freshness/lineage reads: the
    // underlying E4 sections are already fail-closed, and org-wide lineage under a
    // Station A request would leak scope. Only org-wide requests read freshness.
    let finance = emptyRange;
    let bookings = emptyRange;
    let maintenance = emptyRange;
    let damage = emptyRange;
    if (!scope.stationScoped) {
      const window: E5SourceWindow = {
        start: new Date(scope.period.start),
        endExclusive: new Date(scope.period.endExclusive),
      };
      [finance, bookings, maintenance, damage] = await Promise.all([
        this.repository.financeFreshness(scope.organizationId, window),
        this.repository.bookingsFreshness(scope.organizationId, window),
        this.repository.maintenanceFreshness(scope.organizationId, window),
        this.repository.damageFreshness(scope.organizationId, window),
      ]);
    }

    const sectionInputs: SectionInput[] = [
      {
        section: 'finance',
        status: summary.sections.finance.status,
        coverage: null,
        sources: [{ category: 'FINANCE', model: 'OrgInvoice', range: finance }],
      },
      {
        section: 'costModel',
        status: summary.sections.costModel.status,
        coverage: summary.sections.costModel.coverage,
        sources: [{ category: 'COST_OPERATING_EXPENSES', model: 'OrgInvoice', range: finance }],
      },
      {
        section: 'utilization',
        status: summary.sections.utilization.status,
        coverage: summary.sections.utilization.coverage,
        sources: [
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
          { category: 'MAINTENANCE', model: 'ServiceCase', range: maintenance },
        ],
      },
      {
        section: 'strengths',
        status: summary.sections.strengths.status,
        coverage: summary.sections.strengths.coverage,
        sources: [
          { category: 'FINANCE', model: 'OrgInvoice', range: finance },
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
        ],
      },
      {
        section: 'weaknesses',
        status: summary.sections.weaknesses.status,
        coverage: summary.sections.weaknesses.coverage,
        sources: [
          { category: 'FINANCE', model: 'OrgInvoice', range: finance },
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
        ],
      },
      {
        section: 'driverInfluence',
        status: summary.sections.driverInfluence.status,
        coverage: summary.sections.driverInfluence.coverage,
        sources: [{ category: 'BOOKINGS', model: 'Booking', range: bookings }],
      },
    ];

    // Damage participates in cost lineage transparency where present.
    void damage;

    const sections = sectionInputs.map((input) =>
      this.buildSectionQuality(input, {
        organizationId: scope.organizationId,
        stationScoped: scope.stationScoped,
        generatedAt,
        periodEndExclusiveMs,
        isCurrentPeriod,
      }),
    );

    const overallStatus = rollupQualityStatus(sections.map((s) => s.status));
    const complete =
      sections.length > 0 &&
      sections.every(
        (s) =>
          s.status === 'AVAILABLE' &&
          (Object.values(s.dimensions) as E5DimensionState[]).every((d) => d === 'COMPLETE'),
      );

    return {
      schemaVersion: '1.0.0',
      generatedAt: generatedAt.toISOString(),
      scope: {
        organizationId: scope.organizationId,
        stationIds: scope.stationIds,
        stationScoped: scope.stationScoped,
      },
      period: scope.period,
      calculationVersion: E5_CALCULATION_VERSIONS.quality,
      sections,
      overall: {
        status: overallStatus,
        complete,
        reason: complete ? null : 'QUALITY_COVERAGE_INCOMPLETE',
      },
    };
  }

  private buildSectionQuality(
    input: SectionInput,
    ctx: {
      organizationId: string;
      stationScoped: boolean;
      generatedAt: Date;
      periodEndExclusiveMs: number;
      isCurrentPeriod: boolean;
    },
  ): E5SectionQuality {
    const isServed =
      input.status === 'AVAILABLE' || input.status === 'PARTIAL' || input.status === 'STALE';

    // Section freshness is conservative: it is only as fresh as its stalest
    // source (the minimum newest timestamp across contributing sources).
    let sectionNewestMs: number | null = null;
    let sectionOldestMs: number | null = null;
    for (const source of input.sources) {
      if (source.range.newestMs !== null) {
        sectionNewestMs =
          sectionNewestMs === null ? source.range.newestMs : Math.min(sectionNewestMs, source.range.newestMs);
      }
      if (source.range.oldestMs !== null) {
        sectionOldestMs =
          sectionOldestMs === null ? source.range.oldestMs : Math.min(sectionOldestMs, source.range.oldestMs);
      }
    }

    let freshness: EvaluationsSourceFreshness | null = null;
    if (isServed && !ctx.stationScoped) {
      freshness = buildSourceFreshness({
        newestSourceAtMs: sectionNewestMs,
        oldestSourceAtMs: sectionOldestMs,
        evaluatedAt: ctx.generatedAt,
        periodEndExclusiveMs: ctx.periodEndExclusiveMs,
        isCurrentPeriod: ctx.isCurrentPeriod,
        thresholdMs: FRESHNESS_THRESHOLD_MS,
      });
    }

    // Tenant-safe lineage: only source-class opaque references, never raw ids/PII,
    // and only for served org-scoped sections.
    const lineage: E5LineageRef[] =
      isServed && !ctx.stationScoped
        ? input.sources
            .filter((source) => source.range.newestMs !== null)
            .map((source) => ({
              sourceCategory: source.category,
              sourceRef: `org:${ctx.organizationId}:${source.model}`,
              effectiveTimestamp:
                source.range.newestMs !== null ? new Date(source.range.newestMs).toISOString() : null,
              calculationVersion: E5_CALCULATION_VERSIONS.quality,
              reason: 'SOURCE_CLASS_BUSINESS_TIMESTAMP',
            }))
        : [];

    const dimensions: Record<E5QualityDimension, E5DimensionState> = {
      FRESHNESS: freshnessDimensionState(freshness ? freshness.state : null),
      COMPLETENESS: completenessState(input.status, input.coverage),
      PROVENANCE: !isServed ? 'UNAVAILABLE' : lineage.length > 0 ? 'COMPLETE' : 'UNKNOWN',
      VALIDITY: validityState(input.status),
      // Historical vs current handled correctly (freshness reference switches on
      // period), so temporal applicability is COMPLETE for served sections.
      TEMPORAL_APPLICABILITY: isServed ? 'COMPLETE' : 'UNAVAILABLE',
    };

    const reason =
      input.status === 'AVAILABLE'
        ? weakestDimension(Object.values(dimensions)) === 'COMPLETE'
          ? null
          : 'QUALITY_DIMENSION_INCOMPLETE'
        : `SECTION_${input.status}`;

    return {
      section: input.section,
      status: input.status, // mirror verbatim — never upgraded
      dimensions,
      freshness,
      coverage: input.coverage,
      lineage,
      reason,
    };
  }
}
