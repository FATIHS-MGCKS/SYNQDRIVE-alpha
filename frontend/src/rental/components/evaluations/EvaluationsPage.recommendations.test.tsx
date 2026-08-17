// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import {
  e7TestRecommendation,
  e7TestResponse,
} from '../../lib/evaluations/evaluations-recommendations-test-fixtures';

const summaryState = vi.fn();
const qualityState = vi.fn();
const recommendationsState = vi.fn();
const financeState = vi.fn();
const driverHook = vi.fn();

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-a' }),
}));

vi.mock('../../lib/fleet-station-filter', () => ({
  readPersistedDashboardStationId: () => null,
}));

vi.mock('../../hooks/useEvaluationsCanonicalAnalytics', () => ({
  useEvaluationsInsightsSummary: () => summaryState(),
  useEvaluationsQuality: () => qualityState(),
  useEvaluationsRecommendations: () => recommendationsState(),
  useEvaluationsDriverInfluence: (...args: unknown[]) => driverHook(...args),
}));

vi.mock('../../hooks/useEvaluationsFinanceBundle', () => ({
  useEvaluationsFinanceBundle: () => financeState(),
}));

import { EvaluationsPage } from './EvaluationsPage';

const LOADING = { phase: 'LOADING' as const };
const IDLE = { phase: 'IDLE' as const };

const minimalSummary = {
  sections: {
    utilization: { status: 'UNAVAILABLE', utilizationPercent: { status: 'UNAVAILABLE' }, eligibleVehicles: null, occupancyBasis: 'SCHEDULED', blockedMs: null, reason: null },
    strengths: { status: 'UNAVAILABLE', strengths: [], skippedDimensions: [], evaluatedDimensions: [] },
    weaknesses: { status: 'UNAVAILABLE', weaknesses: [], skippedDimensions: [], evaluatedDimensions: [] },
    finance: { status: 'UNAVAILABLE', metrics: {}, reason: null },
    costModel: { status: 'UNAVAILABLE', categories: [], mixedCurrency: false, reason: null },
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  summaryState.mockReturnValue(LOADING);
  qualityState.mockReturnValue(IDLE);
  financeState.mockReturnValue(LOADING);
  recommendationsState.mockReturnValue(LOADING);
  driverHook.mockReturnValue(IDLE);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.getElementById('evaluations-section-driver')?.remove();
});

function renderPage() {
  act(() => root.render(createElement(LanguageProvider, null, createElement(EvaluationsPage))));
}

describe('E7C EvaluationsPage — section placement', () => {
  it('renders Recommendations after Executive Summary and before Strengths/Weaknesses', () => {
    summaryState.mockReturnValue({
      phase: 'SETTLED',
      result: { state: 'AVAILABLE', data: minimalSummary },
    });
    recommendationsState.mockReturnValue({
      phase: 'SETTLED',
      result: { state: 'AVAILABLE', data: e7TestResponse() },
    });
    renderPage();
    const ids = Array.from(
      container.querySelectorAll(
        '[data-testid="evaluations-executive"], [data-testid="evaluations-recommendations"], [data-testid="evaluations-sw"]',
      ),
    ).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['evaluations-executive', 'evaluations-recommendations', 'evaluations-sw']);
  });
});

describe('E7C driver lazy reveal regression', () => {
  beforeEach(() => {
    const driverAnchor = document.createElement('div');
    driverAnchor.id = 'evaluations-section-driver';
    document.body.appendChild(driverAnchor);

    summaryState.mockReturnValue({
      phase: 'SETTLED',
      result: { state: 'AVAILABLE', data: minimalSummary },
    });
    recommendationsState.mockReturnValue({
      phase: 'SETTLED',
      result: {
        state: 'AVAILABLE',
        data: e7TestResponse({
          recommendations: [
            e7TestRecommendation({
              id: 'rec-driver',
              family: 'DRIVER_INFLUENCE_REVIEW',
              category: 'DRIVER',
              titleKey: 'evaluations.recommendations.driverInfluenceReview.title',
              explanationKey: 'evaluations.recommendations.driverInfluenceReview.explanation',
              copyParams: [],
              actions: [
                {
                  actionType: 'NAVIGATION',
                  mutating: false,
                  labelKey: 'evaluations.recommendations.actions.viewDriverInfluence',
                  target: { kind: 'EVALUATIONS_SECTION', value: 'driver' },
                  confirmationRequired: false,
                },
              ],
            }),
          ],
        }),
      },
    });
  });

  it('driver recommendation action scrolls only — driver-analysis fetch count remains 0 until reveal', async () => {
    renderPage();
    const driverAnchor = document.getElementById('evaluations-section-driver')!;
    driverAnchor.scrollIntoView = vi.fn();
    driverAnchor.focus = vi.fn();

    const actionBtn = container.querySelector(
      '[data-testid="evaluations-recommendation-action-rec-driver-0"]',
    ) as HTMLButtonElement;
    expect(actionBtn).not.toBeNull();
    act(() => actionBtn.click());
    expect(driverHook).not.toHaveBeenCalled();
    expect(driverAnchor.scrollIntoView).toHaveBeenCalled();

    const revealBtn = container.querySelector('[data-testid="evaluations-driver-toggle"]') as HTMLButtonElement;
    expect(revealBtn).not.toBeNull();
    act(() => revealBtn.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(driverHook).toHaveBeenCalledTimes(1);
  });
});
