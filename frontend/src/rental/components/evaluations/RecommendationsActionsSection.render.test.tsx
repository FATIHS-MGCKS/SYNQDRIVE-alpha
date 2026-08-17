// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import {
  e7TestRecommendation,
  e7TestResponse,
  E7_TEST_MTD_PERIOD,
} from '../../lib/evaluations/evaluations-recommendations-test-fixtures';
import { RecommendationsActionsSection } from './RecommendationsActionsSection';

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

const settled = <T,>(data: T): EvaluationsAsyncResult<T> => ({
  phase: 'SETTLED',
  result: { state: 'AVAILABLE', data },
});

describe('E7C RecommendationsActionsSection — server order preserved', () => {
  it('renders recommendations in server array order (no client sort)', () => {
    const recA = e7TestRecommendation({
      id: 'rec-z-last-display',
      family: 'STRENGTH_REINFORCE',
      severity: 'INFO',
      titleKey: 'evaluations.recommendations.strengthReinforce.title',
      explanationKey: 'evaluations.recommendations.strengthReinforce.explanation',
      copyParams: [{ key: 'ruleId', type: 'TEXT', value: 'RULE_Z' }],
    });
    const recB = e7TestRecommendation({
      id: 'rec-a-first-display',
      family: 'RECEIVABLES_ATTENTION',
      severity: 'CRITICAL',
    });
    const data = e7TestResponse({ recommendations: [recB, recA] });
    render(createElement(RecommendationsActionsSection, { recommendations: settled(data) }));
    const cards = container.querySelectorAll('article[data-testid^="evaluations-recommendation-"]');
    expect(cards[0]?.getAttribute('data-testid')).toBe('evaluations-recommendation-rec-a-first-display');
    expect(cards[1]?.getAttribute('data-testid')).toBe('evaluations-recommendation-rec-z-last-display');
    expect(container.innerHTML.includes('.sort(')).toBe(false);
  });
});

describe('E7C empty states — server authority only', () => {
  it('AVAILABLE + NO_ACTION_NEEDED', () => {
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [], emptyState: 'NO_ACTION_NEEDED', status: 'AVAILABLE' })),
      }),
    );
    expect(container.querySelector('[data-testid="evaluations-recommendations-empty-NO_ACTION_NEEDED"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('No actions needed');
  });

  it('PARTIAL + INSUFFICIENT_EVIDENCE', () => {
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(
          e7TestResponse({ recommendations: [], emptyState: 'INSUFFICIENT_EVIDENCE', status: 'PARTIAL' }),
        ),
      }),
    );
    expect(container.querySelector('[data-testid="evaluations-recommendations-empty-INSUFFICIENT_EVIDENCE"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('Partial data');
    expect(container.textContent ?? '').toContain('Not enough evidence');
  });

  it('emptyState null → fail-closed fallback', () => {
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [], emptyState: null, status: 'UNAVAILABLE' })),
      }),
    );
    expect(container.querySelector('[data-testid="evaluations-recommendations-empty-null"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('not available');
  });
});

describe('E7C copy keys — unknown keys fail closed', () => {
  it('does not render raw unknown title key', () => {
    const rec = e7TestRecommendation({
      titleKey: 'evaluations.recommendations.totally.unknown',
      explanationKey: 'evaluations.recommendations.receivablesAttention.explanation',
    });
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [rec] })),
      }),
    );
    expect(container.textContent ?? '').not.toContain('totally.unknown');
    expect(container.textContent ?? '').toContain('Details unavailable');
  });
});

describe('E7C provenance — finance MTD source period preserved', () => {
  it('shows MTD for finance source when page request period differs', () => {
    const rec = e7TestRecommendation({
      provenance: {
        ...e7TestRecommendation().provenance,
        sourcePeriods: [{ source: 'finance', period: E7_TEST_MTD_PERIOD }],
        period: E7_TEST_MTD_PERIOD,
      },
    });
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(
          e7TestResponse({ requestPeriod: { ...E7_TEST_MTD_PERIOD, periodType: 'ROLLING_30_DAYS' }, recommendations: [rec] }),
        ),
      }),
    );
    const periodEl = container.querySelector('[data-testid="evaluations-rec-source-period-finance"]');
    expect(periodEl?.textContent ?? '').toContain('Month to date');
    expect(periodEl?.textContent ?? '').not.toContain('Last 30 days');
  });

  it('FRESHNESS UNKNOWN remains Unknown in quality limitations', () => {
    const rec = e7TestRecommendation({
      provenance: {
        ...e7TestRecommendation().provenance,
        qualityLimitations: [{ dimension: 'FRESHNESS', state: 'UNKNOWN' }],
      },
    });
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [rec] })),
      }),
    );
    const lim = container.querySelector('[data-testid="evaluations-rec-quality-FRESHNESS-UNKNOWN"]');
    expect(lim?.textContent ?? '').toContain('Unknown');
    expect(lim?.textContent ?? '').not.toContain('Stale');
  });
});

describe('E7C actions — allowlisted section navigation only', () => {
  beforeEach(() => {
    for (const id of ['finance', 'driver', 'weaknesses']) {
      const el = document.createElement('div');
      el.id = `evaluations-section-${id}`;
      document.body.appendChild(el);
    }
  });
  afterEach(() => {
    for (const id of ['finance', 'driver', 'weaknesses']) {
      document.getElementById(`evaluations-section-${id}`)?.remove();
    }
  });

  it('executes valid finance section navigation', () => {
    const financeEl = document.getElementById('evaluations-section-finance')!;
    financeEl.scrollIntoView = vi.fn();
    financeEl.focus = vi.fn();
    render(createElement(RecommendationsActionsSection, { recommendations: settled(e7TestResponse()) }));
    const btn = container.querySelector('[data-testid^="evaluations-recommendation-action-"]') as HTMLButtonElement;
    act(() => btn.click());
    expect(financeEl.scrollIntoView).toHaveBeenCalled();
  });

  it('disables invalid section target', () => {
    const rec = e7TestRecommendation({
      actions: [
        {
          actionType: 'NAVIGATION',
          mutating: false,
          labelKey: 'evaluations.recommendations.actions.viewFinance',
          target: { kind: 'EVALUATIONS_SECTION', value: 'not-valid' as never },
          confirmationRequired: false,
        },
      ],
    });
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [rec] })),
      }),
    );
    const btn = container.querySelector('button[data-testid^="evaluations-recommendation-action-"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables mutating=true actions', () => {
    const rec = e7TestRecommendation({
      actions: [
        {
          actionType: 'NAVIGATION',
          mutating: true as never,
          labelKey: 'evaluations.recommendations.actions.viewFinance',
          target: { kind: 'EVALUATIONS_SECTION', value: 'finance' },
          confirmationRequired: false,
        },
      ],
    });
    render(
      createElement(RecommendationsActionsSection, {
        recommendations: settled(e7TestResponse({ recommendations: [rec] })),
      }),
    );
    const btn = container.querySelector('button[data-testid^="evaluations-recommendation-action-"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
