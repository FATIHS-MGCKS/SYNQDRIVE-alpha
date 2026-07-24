// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvaluationsMetricValue } from './EvaluationsMetricValue';
import type { EvaluationsResolvedMetricState } from '@synq/evaluations-insights/evaluations-metric-state.contract';

const baseState = (
  overrides: Partial<EvaluationsResolvedMetricState>,
): EvaluationsResolvedMetricState => ({
  kind: 'available',
  fetchPhase: 'ready',
  canShowValue: true,
  showStaleOverlay: false,
  displayValue: '12',
  rawValue: 12,
  tooltip: 'ok',
  shortLabel: 'Verfügbar',
  ...overrides,
});

describe('EvaluationsMetricValue', () => {
  it('renders em dash on error instead of zero', () => {
    const html = renderToStaticMarkup(
      <EvaluationsMetricValue
        state={baseState({
          kind: 'error',
          canShowValue: false,
          displayValue: null,
          rawValue: null,
        })}
      />,
    );
    expect(html).toContain('—');
    expect(html).not.toContain('>0<');
  });

  it('renders skeleton while loading', () => {
    const html = renderToStaticMarkup(
      <EvaluationsMetricValue state={baseState({ fetchPhase: 'loading', canShowValue: false })} />,
    );
    expect(html.length).toBeGreaterThan(20);
  });

  it('shows stale badge for partial state', () => {
    const html = renderToStaticMarkup(
      <EvaluationsMetricValue
        state={baseState({ kind: 'partial', canShowValue: false, displayValue: null })}
      />,
    );
    expect(html).toContain('Teilweise');
  });
});
