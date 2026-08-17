// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { en } from '../../i18n/translations/en';
import {
  buildCopyParamVariables,
  executeRecommendationAction,
  formatE7CopyParamValue,
  formatE7PercentValue,
  isTranslationKey,
  resolveRecommendationCopy,
  scrollToEvaluationsSection,
  sectionAnchorId,
} from '../../components/evaluations/recommendation-presentation';
import type { E7CopyParam } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';

const t = (key: keyof typeof en, vars?: Record<string, string | number>) => {
  let s = en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
};

describe('E7C translation key resolution — fail closed', () => {
  it('accepts known server keys', () => {
    expect(isTranslationKey('evaluations.recommendations.receivablesAttention.title')).toBe(true);
  });

  it('rejects unknown keys and uses copyUnavailable fallback', () => {
    const out = resolveRecommendationCopy(t, 'totally.unknown.key', [], 'en-US');
    expect(out).toBe(en['evaluations.recommendations.copyUnavailable']);
    expect(out).not.toContain('totally.unknown.key');
  });

  it('resolves title with money copy params', () => {
    const out = resolveRecommendationCopy(
      t,
      'evaluations.recommendations.receivablesAttention.title',
      [{ key: 'amount', type: 'MONEY', value: { amountMinor: 100000, currency: 'USD' } }],
      'en-US',
    );
    expect(out).toContain('Review overdue receivables');
  });
});

describe('E7C copy param formatting — money authority', () => {
  const locale = 'en-US';

  it('formats EUR', () => {
    expect(
      formatE7CopyParamValue({ key: 'amount', type: 'MONEY', value: { amountMinor: 123456, currency: 'EUR' } }, locale),
    ).toMatch(/€|EUR/);
  });

  it('formats USD', () => {
    expect(
      formatE7CopyParamValue({ key: 'amount', type: 'MONEY', value: { amountMinor: 100000, currency: 'USD' } }, locale),
    ).toBe('$1,000.00');
  });

  it('formats JPY without /100', () => {
    expect(
      formatE7CopyParamValue({ key: 'amount', type: 'MONEY', value: { amountMinor: 1000, currency: 'JPY' } }, locale),
    ).toBe('¥1,000');
  });

  it('formats KWD with 3-decimal exponent', () => {
    expect(
      formatE7CopyParamValue({ key: 'amount', type: 'MONEY', value: { amountMinor: 1234, currency: 'KWD' } }, locale),
    ).toContain('1.234');
  });
});

describe('E7C PERCENT convention — 0–100 scale, no double scaling', () => {
  it('displays backend observedValue 15 as "15 %" not 1500%', () => {
    const out = formatE7PercentValue(15, 'en-US');
    expect(out).toBe('15 %');
    expect(out).not.toContain('1,500');
  });

  it('buildCopyParamVariables maps PERCENT params for templates', () => {
    const params: E7CopyParam[] = [
      { key: 'observedPercent', type: 'PERCENT', value: 15 },
      { key: 'thresholdPercent', type: 'PERCENT', value: 10 },
    ];
    const vars = buildCopyParamVariables(params, 'en-US');
    expect(vars?.observedPercent).toBe('15 %');
    expect(vars?.thresholdPercent).toBe('10 %');
  });
});

describe('E7C action execution — allowlisted non-mutating only', () => {
  it('scrolls to allowlisted section anchor', () => {
    const el = document.createElement('div');
    el.id = sectionAnchorId('finance');
    document.body.appendChild(el);
    el.scrollIntoView = vi.fn();
    el.focus = vi.fn();
    expect(
      executeRecommendationAction({ kind: 'EVALUATIONS_SECTION', value: 'finance' }, false),
    ).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalled();
    el.remove();
  });

  it('rejects mutating actions', () => {
    expect(
      executeRecommendationAction({ kind: 'EVALUATIONS_SECTION', value: 'finance' }, true as never),
    ).toBe(false);
  });

  it('rejects unknown section targets', () => {
    expect(
      executeRecommendationAction(
        { kind: 'EVALUATIONS_SECTION', value: 'not-a-section' as never },
        false,
      ),
    ).toBe(false);
  });

  it('rejects arbitrary application routes (no router mapping in E7C)', () => {
    expect(
      executeRecommendationAction({ kind: 'APPLICATION_ROUTE', value: 'financial-insights' }, false),
    ).toBe(false);
  });

  it('rejects entity references without canonical routing', () => {
    expect(
      executeRecommendationAction(
        { kind: 'ENTITY_REFERENCE', entityKind: 'vehicle', entityId: 'veh-1' },
        false,
      ),
    ).toBe(false);
  });
});

describe('E7C copy param safety', () => {
  it('rejects duplicate param keys', () => {
    expect(
      buildCopyParamVariables(
        [
          { key: 'amount', type: 'MONEY', value: { amountMinor: 100, currency: 'EUR' } },
          { key: 'amount', type: 'TEXT', value: 'x' },
        ],
        'en-US',
      ),
    ).toBeNull();
  });

  it('scrollToEvaluationsSection returns false when anchor missing', () => {
    expect(scrollToEvaluationsSection('quality')).toBe(false);
  });
});
