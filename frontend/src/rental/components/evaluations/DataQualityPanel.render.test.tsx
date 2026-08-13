// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { DataQualityPanel } from './DataQualityPanel';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsQualityReport,
  EvaluationsDataCoverage,
  EvaluationsPeriodWindow,
} from '../../lib/evaluations/evaluations-canonical.types';

const PERIOD = {
  periodType: 'MTD',
  start: '2026-06-01T00:00:00.000Z',
  endExclusive: '2026-07-01T00:00:00.000Z',
  reference: '2026-06-16T12:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
} satisfies EvaluationsPeriodWindow;

// Backend-reachable non-null coverage lives on the utilization section (finance
// coverage is ALWAYS null per the E5 service). Every field present + validated.
const COVERAGE_UTILIZATION = {
  expectedRecords: 100,
  availableRecords: 80,
  excludedRecords: 20,
  ratio: 0.8,
  missingSources: ['SCHEDULED_OCCUPANCY_NOT_ACTUAL', 'VEHICLE_ELIGIBILITY_HISTORY', 'BLOCKED_HISTORY'],
} satisfies EvaluationsDataCoverage;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactElement) {
  act(() => root.render(createElement(LanguageProvider, null, node)));
}

const settled = (data: EvaluationsQualityReport): EvaluationsAsyncResult<EvaluationsQualityReport> => ({
  phase: 'SETTLED',
  result: { state: 'AVAILABLE', data },
});

function report(): EvaluationsQualityReport {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-06-16T12:00:00.000Z',
    // One canonical org scope for the whole report (no per-section station scope).
    scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
    period: PERIOD,
    calculationVersion: 'evaluations-quality-e5-v2',
    sections: [
      {
        // Served org-scoped section carrying canonical non-null coverage. A utilization
        // result with a valid denominator mirrors the E4 PARTIAL status (SECTION_PARTIAL).
        section: 'utilization',
        status: 'PARTIAL',
        dimensions: {
          FRESHNESS: 'UNKNOWN', // no ingestion authority → UNKNOWN (never COMPLETE)
          COMPLETENESS: 'PARTIAL',
          PROVENANCE: 'COMPLETE', // COMPLETE because both required lineages exist
          VALIDITY: 'UNKNOWN', // no independent validity authority → UNKNOWN
          TEMPORAL_APPLICABILITY: 'COMPLETE',
        },
        // Pipeline freshness UNKNOWN with all timestamps null (E5.1A authority),
        // separate from the recent business-event recency below.
        freshness: {
          newestSourceAt: null,
          oldestSourceAt: null,
          lastSuccessfulImportAt: null,
          evaluatedAt: '2026-06-16T12:00:00.000Z',
          state: 'UNKNOWN',
        },
        businessEventRecency: { newestAt: '2026-06-15T00:00:00.000Z', oldestAt: '2026-06-01T00:00:00.000Z' },
        coverage: COVERAGE_UTILIZATION,
        requiredSourceClasses: ['BOOKINGS', 'MAINTENANCE'],
        // Canonical E5 lineage: sourceRef = `org:<orgId>:<model>`, calculationVersion
        // = E5 quality version.
        lineage: [
          { sourceCategory: 'BOOKINGS', sourceRef: 'org:org-a:Booking', effectiveTimestamp: '2026-06-15T00:00:00.000Z', calculationVersion: 'evaluations-quality-e5-v2', reason: 'SOURCE_CLASS_BUSINESS_EVENT_RECENCY' },
          { sourceCategory: 'MAINTENANCE', sourceRef: 'org:org-a:ServiceCase', effectiveTimestamp: '2026-06-10T00:00:00.000Z', calculationVersion: 'evaluations-quality-e5-v2', reason: 'SOURCE_CLASS_BUSINESS_EVENT_RECENCY' },
        ],
        reason: 'SECTION_PARTIAL',
      },
      {
        // Backend-reachable UNAVAILABLE section: null coverage; dimensions stay
        // UNAVAILABLE (never healthy/zero), same org scope (not station-scoped).
        section: 'finance',
        status: 'UNAVAILABLE',
        dimensions: {
          FRESHNESS: 'UNAVAILABLE',
          COMPLETENESS: 'UNAVAILABLE',
          PROVENANCE: 'UNAVAILABLE',
          VALIDITY: 'UNAVAILABLE',
          TEMPORAL_APPLICABILITY: 'UNAVAILABLE',
        },
        freshness: null,
        businessEventRecency: null,
        coverage: null,
        requiredSourceClasses: ['FINANCE_INVOICE', 'FINANCE_PAYMENT'],
        lineage: [],
        reason: 'SECTION_UNAVAILABLE',
      },
    ],
    overall: { status: 'PARTIAL', complete: false, reason: 'QUALITY_INCOMPLETE' },
  };
}

describe('E6C DataQualityPanel', () => {
  it('renders all five E5 dimensions distinctly', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    for (const dim of ['FRESHNESS', 'COMPLETENESS', 'PROVENANCE', 'VALIDITY', 'TEMPORAL_APPLICABILITY']) {
      expect(container.querySelectorAll(`[data-testid="evaluations-quality-dimension-${dim}"]`).length).toBeGreaterThan(0);
    }
  });

  it('UNKNOWN dimension does not become COMPLETE/healthy; UNAVAILABLE is not zero', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    expect(util.textContent ?? '').toContain('Unknown'); // FRESHNESS/VALIDITY: UNKNOWN
    const finance = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    expect(finance.textContent ?? '').toContain('Unavailable'); // UNAVAILABLE section dims
    expect(finance.textContent ?? '').not.toContain('0.00');
  });

  it('shows no global/aggregate quality score', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    expect(container.querySelector('[data-testid="evaluations-quality-score"]')).toBeNull();
    // Overall is a canonical status badge, not a computed number.
    expect(container.querySelector('[data-testid="evaluations-quality-overall"]')).not.toBeNull();
  });

  it('pipeline freshness and business-event recency have separate labels', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const text = container.textContent ?? '';
    expect(text).toContain('Pipeline freshness');
    expect(text).toContain('Business-event recency');
  });

  it('unknown pipeline freshness stays UNKNOWN even when business events are recent', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    // Freshness badge is the UNKNOWN state, not derived FRESH from recent business events.
    expect(util.querySelector('[data-testid="evaluations-quality-freshness-UNKNOWN"]')).not.toBeNull();
    expect(util.querySelector('[data-testid="evaluations-quality-freshness-FRESH"]')).toBeNull();
  });

  it('null (org-scoped) freshness/recency/lineage on an UNAVAILABLE section render neutrally (not healthy/zero)', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const finance = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    const text = finance.textContent ?? '';
    expect(text).toContain('Not available for this scope');
    // Null freshness must not be rendered as a FRESH pipeline state.
    expect(finance.querySelector('[data-testid="evaluations-quality-freshness-FRESH"]')).toBeNull();
  });

  it('coverage null renders unavailable, not zero', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const finance = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    const cov = finance.querySelector('[data-testid="evaluations-quality-coverage"]')!;
    expect(cov.textContent ?? '').not.toContain('0%');
    expect(cov.textContent ?? '').toContain('Not available for this scope');
  });

  it('renders every canonical coverage field (expected/available/excluded/ratio/missingSources) in server order', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    const cov = util.querySelector('[data-testid="evaluations-quality-coverage"]')!;
    expect(cov.querySelector('[data-testid="evaluations-quality-coverage-expected"]')?.textContent ?? '').toContain('100');
    expect(cov.querySelector('[data-testid="evaluations-quality-coverage-available"]')?.textContent ?? '').toContain('80');
    expect(cov.querySelector('[data-testid="evaluations-quality-coverage-excluded"]')?.textContent ?? '').toContain('20');
    expect(cov.querySelector('[data-testid="evaluations-quality-coverage-ratio"]')?.textContent ?? '').toContain('80%');
    const missing = cov.querySelector('[data-testid="evaluations-quality-coverage-missing-sources"]')?.textContent ?? '';
    expect(missing).toContain('SCHEDULED_OCCUPANCY_NOT_ACTUAL');
    expect(missing.indexOf('SCHEDULED_OCCUPANCY_NOT_ACTUAL')).toBeLessThan(missing.indexOf('BLOCKED_HISTORY')); // server order
  });

  it('keeps requiredSourceClasses and coverage.missingSources distinguishable', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    const text = util.textContent ?? '';
    expect(text).toContain('Required sources'); // requiredSourceClasses label
    expect(text).toContain('Missing sources'); // coverage.missingSources label
    expect(text).toContain('BOOKINGS'); // required source class (distinct)
    expect(text).toContain('MAINTENANCE'); // required source class (distinct)
    expect(text).toContain('SCHEDULED_OCCUPANCY_NOT_ACTUAL'); // missing source (distinct concept)
  });

  it('renders canonical E5 lineage calculationVersion', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const lineage = container.querySelector('[data-testid="evaluations-quality-lineage"]')!;
    expect(lineage.textContent ?? '').toContain('evaluations-quality-e5-v2');
  });

  it('lineage sourceRef (org:<org>:<model>) is shown verbatim without entity reconstruction', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    expect(util.querySelector('[data-testid="evaluations-quality-lineage"]')?.textContent ?? '').toContain('org:org-a:Booking');
  });

  it('utilization section status is PARTIAL (mirrored, not upgraded) with SECTION_PARTIAL reason', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    expect(util.querySelector('[data-testid="evaluations-status-PARTIAL"]')).not.toBeNull();
    expect(util.querySelector('[data-testid="evaluations-status-AVAILABLE"]')).toBeNull();
    expect(util.textContent ?? '').toContain('SECTION_PARTIAL');
  });

  it('generic 404 renders neutral NOT_FOUND copy (never feature disabled)', () => {
    const notFound: EvaluationsAsyncResult<EvaluationsQualityReport> = { phase: 'SETTLED', result: { state: 'NOT_FOUND' } };
    render(createElement(DataQualityPanel, { quality: notFound }));
    const text = container.textContent ?? '';
    expect(text).toContain('Analytics are not available for this scope.');
    expect(text.toLowerCase()).not.toContain('disabled');
    expect(text.toLowerCase()).not.toContain('deaktiviert');
  });
});
