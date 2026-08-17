/**
 * E7C presentation-only helpers for canonical recommendations.
 * NO business derivation, NO reordering, NO threshold logic — server copy keys and
 * typed copy params are formatted for display only.
 */
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import {
  E7_APPLICATION_ROUTE_TARGETS,
  E7_ENTITY_REFERENCE_KINDS,
  E7_EVALUATIONS_SECTION_TARGETS,
  type E7ActionTarget,
  type E7CopyParam,
  type E7EvaluationsSectionTarget,
  type E7QualityLimitation,
  type E7Recommendation,
  type E7RecommendationCategory,
  type E7RecommendationEmptyState,
  type E7RecommendationSeverity,
} from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { en, type TranslationKey } from '../../i18n/translations/en';
import { formatEvaluationsMoney } from '../../lib/evaluations/evaluations-money';
import {
  dimensionLabelKey,
  dimensionStateLabelKey,
  toneClassName,
  dimensionStateTone,
} from './evaluations-presentation';

export const E7_COPY_UNAVAILABLE_KEY = 'evaluations.recommendations.copyUnavailable' as const;

/** Fail-closed translation key guard — EN dictionary is compile-time authority. */
export function isTranslationKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

export function sectionAnchorId(target: E7EvaluationsSectionTarget): string {
  return `evaluations-section-${target}`;
}

const SECTION_ANCHOR_TARGETS = new Set<string>(E7_EVALUATIONS_SECTION_TARGETS);
const ROUTE_TARGETS = new Set<string>(E7_APPLICATION_ROUTE_TARGETS);
const ENTITY_KINDS = new Set<string>(E7_ENTITY_REFERENCE_KINDS);

function isEvaluationsSectionTarget(value: string): value is E7EvaluationsSectionTarget {
  return SECTION_ANCHOR_TARGETS.has(value);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Scroll to an allowlisted evaluations section anchor (presentation navigation only). */
export function scrollToEvaluationsSection(target: E7EvaluationsSectionTarget): boolean {
  const el = document.getElementById(sectionAnchorId(target));
  if (!el) return false;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return true;
}

function isValidMoney(value: unknown): value is EvaluationsMoney {
  if (!value || typeof value !== 'object') return false;
  const m = value as EvaluationsMoney;
  return (
    typeof m.amountMinor === 'number' &&
    Number.isFinite(m.amountMinor) &&
    typeof m.currency === 'string' &&
    m.currency.trim().length > 0
  );
}

/**
 * E7 PERCENT convention: server sends 0–100 scale (same as utilization KPI).
 * Display as "{value} %" — never Intl percent style (which expects 0–1).
 */
export function formatE7PercentValue(value: number, locale: string): string | null {
  if (!Number.isFinite(value)) return null;
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return `${formatted} %`;
}

export function formatE7CopyParamValue(
  param: E7CopyParam,
  locale: string,
): string | null {
  switch (param.type) {
    case 'TEXT':
      return typeof param.value === 'string' ? param.value : null;
    case 'NUMBER':
    case 'COUNT':
      return typeof param.value === 'number' && Number.isFinite(param.value)
        ? new Intl.NumberFormat(locale).format(param.value)
        : null;
    case 'PERCENT':
      return typeof param.value === 'number' ? formatE7PercentValue(param.value, locale) : null;
    case 'MONEY':
      return isValidMoney(param.value) ? formatEvaluationsMoney(param.value, locale) : null;
    default:
      return null;
  }
}

/** Build translation variables from server copyParams — no business calculation. */
export function buildCopyParamVariables(
  copyParams: readonly E7CopyParam[],
  locale: string,
): Record<string, string | number> | null {
  const vars: Record<string, string | number> = {};
  const seen = new Set<string>();
  for (const param of copyParams) {
    if (seen.has(param.key)) return null;
    seen.add(param.key);
    const formatted = formatE7CopyParamValue(param, locale);
    if (formatted === null) return null;
    vars[param.key] = formatted;
  }
  return vars;
}

export function resolveRecommendationCopy(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  key: string,
  copyParams: readonly E7CopyParam[],
  locale: string,
): string {
  if (!isTranslationKey(key)) return t(E7_COPY_UNAVAILABLE_KEY);
  const vars = buildCopyParamVariables(copyParams, locale);
  if (vars === null) return t(E7_COPY_UNAVAILABLE_KEY);
  try {
    return t(key, vars);
  } catch {
    return t(E7_COPY_UNAVAILABLE_KEY);
  }
}

export function resolveActionLabelKey(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  labelKey: string,
): string {
  if (!isTranslationKey(labelKey)) return t(E7_COPY_UNAVAILABLE_KEY);
  return t(labelKey);
}

export function categoryLabelKey(category: E7RecommendationCategory): TranslationKey {
  const key = `evaluations.recommendations.category.${category}` as TranslationKey;
  return isTranslationKey(key) ? key : E7_COPY_UNAVAILABLE_KEY;
}

export function severityLabelKey(
  severity: E7RecommendationSeverity,
): TranslationKey | null {
  const key = `evaluations.recommendations.severity.${severity}` as TranslationKey;
  return isTranslationKey(key) ? key : null;
}

export function severityTone(severity: E7RecommendationSeverity): string {
  switch (severity) {
    case 'CRITICAL':
      return toneClassName('critical');
    case 'WARNING':
      return toneClassName('warning');
    case 'INFO':
    default:
      return toneClassName('neutral');
  }
}

export function emptyStateLabelKey(
  emptyState: E7RecommendationEmptyState | null,
): TranslationKey {
  if (emptyState === 'NO_ACTION_NEEDED') {
    return 'evaluations.recommendations.empty.NO_ACTION_NEEDED';
  }
  if (emptyState === 'INSUFFICIENT_EVIDENCE') {
    return 'evaluations.recommendations.empty.INSUFFICIENT_EVIDENCE';
  }
  return 'evaluations.recommendations.empty.fallback';
}

export function sourcePeriodLabelKey(period: EvaluationsPeriodWindow): TranslationKey | null {
  const key = `evaluations.period.${period.periodType}` as TranslationKey;
  return isTranslationKey(key) ? key : null;
}

export function sourceSectionLabelKey(section: string): TranslationKey | null {
  const key = `evaluations.recommendations.sourceSection.${section}` as TranslationKey;
  return isTranslationKey(key) ? key : null;
}

export function qualityLimitationPresentation(
  limitation: E7QualityLimitation,
  t: (key: TranslationKey) => string,
): { dimension: string; state: string; tone: string } {
  const dimKey = dimensionLabelKey(limitation.dimension);
  const stateKey = dimensionStateLabelKey(limitation.state);
  return {
    dimension: t(dimKey),
    state: t(stateKey),
    tone: toneClassName(dimensionStateTone(limitation.state)),
  };
}

/** Runtime fail-closed action execution — non-mutating allowlisted targets only. */
export function executeRecommendationAction(target: E7ActionTarget, mutating: boolean): boolean {
  if (mutating !== false) return false;
  switch (target.kind) {
    case 'EVALUATIONS_SECTION':
      if (!isEvaluationsSectionTarget(target.value)) return false;
      return scrollToEvaluationsSection(target.value);
    case 'APPLICATION_ROUTE':
      if (!ROUTE_TARGETS.has(target.value)) return false;
      // No canonical in-app router mapping for E7C — fail closed.
      return false;
    case 'ENTITY_REFERENCE':
      if (!ENTITY_KINDS.has(target.entityKind)) return false;
      if (!target.entityId?.trim()) return false;
      return false;
    default:
      return false;
  }
}

export function isExecutableAction(action: E7Recommendation['actions'][number]): boolean {
  if (action.mutating !== false) return false;
  if (action.target.kind !== 'EVALUATIONS_SECTION') return false;
  return isEvaluationsSectionTarget(action.target.value);
}
