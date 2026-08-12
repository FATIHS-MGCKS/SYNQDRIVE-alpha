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
  buildUnknownFreshness,
  completenessState,
  freshnessDimensionState,
  provenanceState,
  validityState,
  weakestDimension,
  rollupQualityStatus,
} from './domain/evaluations-quality.domain';

interface SectionInput {
  readonly section: string;
  readonly status: EvaluationsMetricStatus;
  readonly coverage: EvaluationsDataCoverage | null;
  /** Canonical source classes this section's results depend on. */
  readonly requiredSourceClasses: readonly string[];
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

    const emptyRange: E5FreshnessRange = { newestMs: null, oldestMs: null };

    // Station-scoped requests never trigger org-wide freshness/lineage reads: the
    // underlying E4 sections are already fail-closed, and org-wide lineage under a
    // Station A request would leak scope. Only org-wide requests read freshness.
    let finance = emptyRange;
    let payments = emptyRange;
    let bookings = emptyRange;
    let maintenance = emptyRange;
    if (!scope.stationScoped) {
      const window: E5SourceWindow = {
        start: new Date(scope.period.start),
        endExclusive: new Date(scope.period.endExclusive),
      };
      [finance, payments, bookings, maintenance] = await Promise.all([
        this.repository.financeFreshness(scope.organizationId, window),
        this.repository.paymentsFreshness(scope.organizationId, window),
        this.repository.bookingsFreshness(scope.organizationId, window),
        this.repository.maintenanceFreshness(scope.organizationId, window),
      ]);
    }

    const sectionInputs: SectionInput[] = [
      {
        section: 'finance',
        status: summary.sections.finance.status,
        coverage: null,
        // Finance results include issued revenue (invoices) AND paid revenue /
        // cashflow (payments) → both source classes are required for provenance.
        requiredSourceClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'],
        sources: [
          { category: 'FINANCE_INVOICE', model: 'OrgInvoice', range: finance },
          { category: 'FINANCE_PAYMENT', model: 'OrgInvoicePayment', range: payments },
        ],
      },
      {
        section: 'costModel',
        status: summary.sections.costModel.status,
        coverage: summary.sections.costModel.coverage,
        requiredSourceClasses: ['COST_OPERATING_EXPENSES'],
        sources: [{ category: 'COST_OPERATING_EXPENSES', model: 'OrgInvoice', range: finance }],
      },
      {
        section: 'utilization',
        status: summary.sections.utilization.status,
        coverage: summary.sections.utilization.coverage,
        requiredSourceClasses: ['BOOKINGS', 'MAINTENANCE'],
        sources: [
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
          { category: 'MAINTENANCE', model: 'ServiceCase', range: maintenance },
        ],
      },
      {
        section: 'strengths',
        status: summary.sections.strengths.status,
        coverage: summary.sections.strengths.coverage,
        requiredSourceClasses: ['FINANCE_INVOICE', 'BOOKINGS'],
        sources: [
          { category: 'FINANCE_INVOICE', model: 'OrgInvoice', range: finance },
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
        ],
      },
      {
        section: 'weaknesses',
        status: summary.sections.weaknesses.status,
        coverage: summary.sections.weaknesses.coverage,
        requiredSourceClasses: ['FINANCE_INVOICE', 'BOOKINGS'],
        sources: [
          { category: 'FINANCE_INVOICE', model: 'OrgInvoice', range: finance },
          { category: 'BOOKINGS', model: 'Booking', range: bookings },
        ],
      },
      {
        section: 'driverInfluence',
        status: summary.sections.driverInfluence.status,
        coverage: summary.sections.driverInfluence.coverage,
        requiredSourceClasses: ['BOOKINGS'],
        sources: [{ category: 'BOOKINGS', model: 'Booking', range: bookings }],
      },
    ];

    const sections = sectionInputs.map((input) =>
      this.buildSectionQuality(input, {
        organizationId: scope.organizationId,
        stationScoped: scope.stationScoped,
        generatedAt,
      }),
    );

    const overallStatus = rollupQualityStatus(sections.map((s) => s.status));
    // Fully complete requires every section AVAILABLE and every dimension
    // COMPLETE. On current main FRESHNESS is structurally UNKNOWN (no ingestion
    // watermark), so `complete` is honestly false until such an authority exists.
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
        reason: complete ? null : 'QUALITY_INCOMPLETE',
      },
    };
  }

  private buildSectionQuality(
    input: SectionInput,
    ctx: {
      organizationId: string;
      stationScoped: boolean;
      generatedAt: Date;
    },
  ): E5SectionQuality {
    const isServed =
      input.status === 'AVAILABLE' || input.status === 'PARTIAL' || input.status === 'STALE';

    // Business-event recency (activity), NOT pipeline freshness: newest = most
    // recent business event, oldest = earliest, across contributing sources.
    let newestMs: number | null = null;
    let oldestMs: number | null = null;
    for (const source of input.sources) {
      if (source.range.newestMs !== null) {
        newestMs = newestMs === null ? source.range.newestMs : Math.max(newestMs, source.range.newestMs);
      }
      if (source.range.oldestMs !== null) {
        oldestMs = oldestMs === null ? source.range.oldestMs : Math.min(oldestMs, source.range.oldestMs);
      }
    }

    const businessEventRecency =
      isServed && !ctx.stationScoped
        ? {
            newestAt: newestMs !== null ? new Date(newestMs).toISOString() : null,
            oldestAt: oldestMs !== null ? new Date(oldestMs).toISOString() : null,
          }
        : null;

    // Pipeline freshness is UNKNOWN: no authoritative ingestion/sync watermark
    // exists for these sources. Business recency is NEVER presented as freshness.
    const freshness: EvaluationsSourceFreshness | null =
      isServed && !ctx.stationScoped ? buildUnknownFreshness(ctx.generatedAt) : null;

    // Tenant-safe lineage: only source-class opaque references, never raw ids/PII,
    // and only for served org-scoped sources that actually have evidence.
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
              reason: 'SOURCE_CLASS_BUSINESS_EVENT_RECENCY',
            }))
        : [];

    const presentClasses = lineage.map((l) => l.sourceCategory);

    const dimensions: Record<E5QualityDimension, E5DimensionState> = {
      // No ingestion authority → freshness dimension is UNKNOWN (never COMPLETE).
      FRESHNESS: isServed ? freshnessDimensionState('UNKNOWN') : 'UNAVAILABLE',
      COMPLETENESS: completenessState(input.status, input.coverage),
      // Composite: COMPLETE only when EVERY required source class is present.
      PROVENANCE: provenanceState({
        served: isServed,
        requiredClasses: input.requiredSourceClasses,
        presentClasses,
      }),
      // E5.2: no independent validity authority → UNKNOWN for served, never a
      // fabricated COMPLETE from "not ERROR".
      VALIDITY: validityState(input.status),
      // Temporal applicability is affirmed by the E1 period-window authority: a
      // served section is computed for exactly the authorized period window.
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
      businessEventRecency,
      coverage: input.coverage,
      requiredSourceClasses: input.requiredSourceClasses,
      lineage,
      reason,
    };
  }
}
