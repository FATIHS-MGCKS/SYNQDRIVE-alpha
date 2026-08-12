// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { DataQualityPanel } from './DataQualityPanel';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { EvaluationsQualityReport } from '../../lib/evaluations/evaluations-canonical.types';

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
    scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
    period: {},
    calculationVersion: 'evaluations-quality-e5-v2',
    sections: [
      {
        section: 'finance',
        status: 'PARTIAL',
        dimensions: {
          FRESHNESS: 'UNKNOWN',
          COMPLETENESS: 'PARTIAL',
          PROVENANCE: 'COMPLETE',
          VALIDITY: 'UNAVAILABLE',
          TEMPORAL_APPLICABILITY: 'COMPLETE',
        },
        // Pipeline freshness UNKNOWN even though business events are recent.
        freshness: {
          newestSourceAt: null,
          oldestSourceAt: null,
          lastSuccessfulImportAt: null,
          evaluatedAt: '2026-06-16T12:00:00.000Z',
          state: 'UNKNOWN',
        },
        businessEventRecency: { newestAt: '2026-06-15T00:00:00.000Z', oldestAt: '2026-06-01T00:00:00.000Z' },
        coverage: { expectedRecords: 100, availableRecords: 80, excludedRecords: 0, ratio: 0.8 },
        requiredSourceClasses: ['OrgInvoice'],
        lineage: [
          { sourceCategory: 'OrgInvoice', sourceRef: 'src::opaque::abc123', effectiveTimestamp: '2026-06-15T00:00:00.000Z', calculationVersion: 'v', reason: 'primary' },
        ],
        reason: null,
      },
      {
        // Station-scoped: freshness/recency/lineage null/empty; coverage null.
        section: 'utilization',
        status: 'UNAVAILABLE',
        dimensions: {
          FRESHNESS: 'UNAVAILABLE',
          COMPLETENESS: 'UNKNOWN',
          PROVENANCE: 'UNKNOWN',
          VALIDITY: 'UNKNOWN',
          TEMPORAL_APPLICABILITY: 'UNKNOWN',
        },
        freshness: null,
        businessEventRecency: null,
        coverage: null,
        requiredSourceClasses: [],
        lineage: [],
        reason: 'STATION_SCOPE_UNAVAILABLE',
      },
    ],
    overall: { status: 'PARTIAL', complete: false, reason: 'QUALITY_INCOMPLETE' },
  } as unknown as EvaluationsQualityReport;
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
    const financeCard = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    const text = financeCard.textContent ?? '';
    expect(text).toContain('Unknown'); // FRESHNESS: UNKNOWN
    expect(text).toContain('Unavailable'); // VALIDITY: UNAVAILABLE
    expect(text).not.toContain('0.00');
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
    const finance = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    // Freshness badge is the UNKNOWN state, not derived FRESH from recent business events.
    expect(finance.querySelector('[data-testid="evaluations-quality-freshness-UNKNOWN"]')).not.toBeNull();
    expect(finance.querySelector('[data-testid="evaluations-quality-freshness-FRESH"]')).toBeNull();
  });

  it('null station-scoped freshness/recency/lineage render neutrally (not healthy/zero)', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    const text = util.textContent ?? '';
    expect(text).toContain('Not available for this scope');
    // Null freshness must not be rendered as a FRESH pipeline state.
    expect(util.querySelector('[data-testid="evaluations-quality-freshness-FRESH"]')).toBeNull();
  });

  it('coverage null renders unavailable, not zero', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const util = container.querySelector('[data-testid="evaluations-quality-section-utilization"]')!;
    const cov = util.querySelector('[data-testid="evaluations-quality-coverage"]')!;
    expect(cov.textContent ?? '').not.toContain('0%');
    expect(cov.textContent ?? '').toContain('Not available for this scope');
  });

  it('lineage sourceRef is shown verbatim without entity reconstruction', () => {
    render(createElement(DataQualityPanel, { quality: settled(report()) }));
    const finance = container.querySelector('[data-testid="evaluations-quality-section-finance"]')!;
    expect(finance.querySelector('[data-testid="evaluations-quality-lineage"]')?.textContent ?? '').toContain('src::opaque::abc123');
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
