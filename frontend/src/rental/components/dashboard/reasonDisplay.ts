/**
 * Reason / severity display helpers — UI-only labeling for the operative
 * dashboard drawer and fleet board.
 *
 * These functions ONLY format text. They never re-derive severity, readiness
 * or blocking — the canonical truth stays in the runtime/slice layer. Their
 * single job is to keep technical source IDs (e.g. `rental-health:tires`,
 * `dashboard-health-risk`, `dashboard-insight:SERVICE_OVERDUE`) out of the
 * user-facing reason pills while preserving the readable title.
 */
import type {
  DashboardSliceRow,
  RuntimeReason,
  RuntimeReasonCategory,
} from './runtime';

const HEALTH_CATEGORIES = new Set<RuntimeReasonCategory>([
  'health',
  'tires',
  'brakes',
  'battery',
  'dtc',
]);

/**
 * Generic, low-signal sources that must never win over a concrete module
 * reason and are pure noise as visible pills (the success/severity badge and
 * the concrete reasons already convey the state).
 */
const GENERIC_SOURCES = new Set<string>(['dashboard-health-risk', 'vehicle-runtime']);

/** Fallback labels per category — only used when a reason has no title. */
const CATEGORY_FALLBACK_LABEL: Record<RuntimeReasonCategory, [string, string]> = {
  operational: ['Operations check', 'Betrieb prüfen'],
  rental: ['Rental check', 'Vermietung prüfen'],
  cleaning: ['Cleaning required', 'Reinigung erforderlich'],
  handover: ['Handover check', 'Übergabe prüfen'],
  health: ['Health check', 'Health prüfen'],
  tires: ['Check tires', 'Reifen prüfen'],
  brakes: ['Check brakes', 'Bremsen prüfen'],
  battery: ['Check battery', 'Batterie prüfen'],
  dtc: ['Check fault codes', 'Fehlercodes prüfen'],
  service: ['Service due', 'Service fällig'],
  compliance: ['Compliance blocked', 'Compliance blockiert'],
  damage: ['Damage check', 'Schaden prüfen'],
  telemetry: ['Telemetry', 'Telemetrie'],
  data_quality: ['Data quality', 'Datenqualität'],
  finance: ['Finance check', 'Finanzen prüfen'],
  unknown: ['Review required', 'Prüfung erforderlich'],
};

function normalizeTitle(title: string | undefined): string {
  return (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The user-facing label for a runtime reason. Always the readable title; the
 * technical `source` is never appended. Falls back to a category label only
 * when the reason carries no title at all.
 */
export function formatRuntimeReasonLabel(reason: RuntimeReason, locale: string): string {
  const title = reason.title?.trim();
  if (title) return title;
  const [en, de] = CATEGORY_FALLBACK_LABEL[reason.category] ?? CATEGORY_FALLBACK_LABEL.unknown;
  return locale === 'de' ? de : en;
}

/**
 * Debug-only provenance for the pill `title` attribute / tooltip. Keeps the
 * source discoverable on hover without polluting the visible label.
 */
export function runtimeReasonTooltip(reason: RuntimeReason, locale: string): string | undefined {
  if (!reason.source) return undefined;
  const label = formatRuntimeReasonLabel(reason, locale);
  return locale === 'de' ? `${label} · Quelle: ${reason.source}` : `${label} · Source: ${reason.source}`;
}

/**
 * Collapse reasons for display: drop the generic health-risk fallback when a
 * concrete rental-health module reason exists, hide pure ready/runtime
 * markers, and de-duplicate by category + normalized title. Pure presentation
 * — it never changes counts or runtime state.
 */
export function dedupeDisplayReasons(reasons: RuntimeReason[]): RuntimeReason[] {
  const hasConcreteHealth = reasons.some(
    (reason) =>
      HEALTH_CATEGORIES.has(reason.category) &&
      typeof reason.source === 'string' &&
      reason.source.startsWith('rental-health:'),
  );

  const seen = new Set<string>();
  const result: RuntimeReason[] = [];
  for (const reason of reasons) {
    // Generic, non-blocking markers add no operative meaning as a pill.
    if (reason.source && GENERIC_SOURCES.has(reason.source)) {
      if (reason.source === 'vehicle-runtime') continue;
      if (reason.source === 'dashboard-health-risk' && hasConcreteHealth) continue;
    }
    const key = `${reason.category}:${normalizeTitle(reason.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reason);
  }
  return result;
}

/**
 * Readable label for a row severity badge. Returns null for `neutral` so the
 * card can simply omit the chip instead of showing a meaningless tag.
 */
export function rowSeverityLabel(
  severity: DashboardSliceRow['severity'],
  locale: string,
): string | null {
  const de = locale === 'de';
  switch (severity) {
    case 'success':
      return de ? 'Bereit' : 'Ready';
    case 'warning':
      return de ? 'Warnung' : 'Warning';
    case 'critical':
      return de ? 'Kritisch' : 'Critical';
    case 'info':
      return 'Info';
    default:
      return null;
  }
}
