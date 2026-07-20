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
import { formatUserFacingReasonLabel } from '../../lib/operational-issues';
import {
  SERVICE_CASE_RUNTIME_REASON_CODE,
} from './runtime/serviceCaseRuntimeReasons';
import { TASK_RUNTIME_REASON_CODE } from './runtime/taskRuntimeReasons';

const HEALTH_CATEGORIES = new Set<RuntimeReasonCategory>([
  'health',
  'tires',
  'brakes',
  'battery',
  'dtc',
]);

export type RuntimeReasonDisplayGroup =
  | 'technical_block'
  | 'service_case_block'
  | 'task_block'
  | 'damage'
  | 'compliance'
  | 'cleaning'
  | 'telemetry'
  | 'booking_operational';

export interface RuntimeReasonDisplayRow {
  reason: RuntimeReason;
  group: RuntimeReasonDisplayGroup;
  groupLabel: string;
  label: string;
  sourceLabel: string;
  actionHint?: string;
  workStatusLabel?: string;
  isChild: boolean;
  parentReasonId?: string;
}

export interface RuntimeReasonDisplayGroupView {
  id: RuntimeReasonDisplayGroup;
  label: string;
  rows: RuntimeReasonDisplayRow[];
}

const DISPLAY_GROUP_ORDER: RuntimeReasonDisplayGroup[] = [
  'technical_block',
  'service_case_block',
  'task_block',
  'damage',
  'compliance',
  'cleaning',
  'telemetry',
  'booking_operational',
];

const DISPLAY_GROUP_LABEL: Record<RuntimeReasonDisplayGroup, [string, string]> = {
  technical_block: ['Technical block', 'Technische Blockade'],
  service_case_block: ['Service case blocks rental', 'Servicefall blockiert'],
  task_block: ['Task blocks rental', 'Aufgabe blockiert'],
  damage: ['Damage', 'Schaden'],
  compliance: ['Compliance', 'Compliance'],
  cleaning: ['Cleaning', 'Reinigung'],
  telemetry: ['Telemetry', 'Telemetrie'],
  booking_operational: ['Booking / operations', 'Buchung / Betrieb'],
};

/**
 * Generic, low-signal sources that must never win over a concrete module
 * reason and are pure noise as visible pills (the success/severity badge and
 * the concrete reasons already convey the state).
 */
const GENERIC_SOURCES = new Set<string>(['dashboard-health-risk', 'vehicle-runtime']);

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

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

const WORK_STATUS_LABEL: Record<string, [string, string]> = {
  OPEN: ['Open', 'Offen'],
  IN_PROGRESS: ['In progress', 'In Bearbeitung'],
  WAITING: ['Waiting', 'Wartend'],
  SCHEDULED: ['Scheduled', 'Geplant'],
  WAITING_VENDOR: ['Waiting for vendor', 'Wartet auf Werkstatt'],
  WAITING_PARTS: ['Waiting for parts', 'Wartet auf Teile'],
  DONE: ['Done', 'Erledigt'],
  CANCELLED: ['Cancelled', 'Abgebrochen'],
  COMPLETED: ['Completed', 'Abgeschlossen'],
};

function isDe(locale: string): boolean {
  return locale === 'de';
}

function normalizeTitle(title: string | undefined): string {
  return (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function stripVisibleUuidText(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(UUID_PATTERN, '')
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function runtimeReasonDisplayGroupLabel(
  group: RuntimeReasonDisplayGroup,
  locale: string,
): string {
  const [en, de] = DISPLAY_GROUP_LABEL[group];
  return isDe(locale) ? de : en;
}

export function resolveRuntimeReasonDisplayGroup(reason: RuntimeReason): RuntimeReasonDisplayGroup {
  if (reason.source === 'SERVICE_CASE') return 'service_case_block';
  if (reason.source === 'TASK') return 'task_block';

  if (reason.category === 'damage') return 'damage';
  if (reason.category === 'compliance') return 'compliance';
  if (reason.category === 'cleaning') return 'cleaning';
  if (reason.category === 'telemetry' || reason.category === 'data_quality') return 'telemetry';
  if (reason.category === 'handover' || reason.category === 'rental' || reason.category === 'operational') {
    return 'booking_operational';
  }

  if (
    HEALTH_CATEGORIES.has(reason.category) ||
    reason.category === 'service' ||
    reason.source?.startsWith('rental-health:') ||
    reason.source === 'rental-health:blocking-reason' ||
    reason.source === 'rental-health:rental-blocked'
  ) {
    return 'technical_block';
  }

  return 'booking_operational';
}

export function formatWorkStatusLabel(status: string | undefined, locale: string): string | undefined {
  if (!status) return undefined;
  const labels = WORK_STATUS_LABEL[status];
  if (!labels) return undefined;
  return isDe(locale) ? labels[1] : labels[0];
}

export function runtimeReasonSourceLabel(reason: RuntimeReason, locale: string): string {
  const de = isDe(locale);
  if (reason.source === 'SERVICE_CASE') return de ? 'Servicefall' : 'Service case';
  if (reason.source === 'TASK') {
    return reason.parentReasonId
      ? (de ? 'Verknüpfte Aufgabe' : 'Linked task')
      : (de ? 'Aufgabe' : 'Task');
  }
  if (reason.source?.startsWith('rental-health:')) return de ? 'Rental Health' : 'Rental Health';
  if (reason.source?.startsWith('dashboard-insight:')) return de ? 'Dashboard-Insight' : 'Dashboard insight';
  if (reason.source?.startsWith('booking-runtime:')) return de ? 'Buchung' : 'Booking';
  if (reason.source === 'telemetry') return de ? 'Telemetrie' : 'Telemetry';
  if (reason.source === 'vehicle-cleaning-status') return de ? 'Reinigung' : 'Cleaning';
  if (reason.category === 'compliance') return de ? 'Compliance' : 'Compliance';
  if (reason.category === 'damage') return de ? 'Schaden' : 'Damage';
  return de ? 'Betrieb' : 'Operations';
}

export function runtimeReasonActionHint(reason: RuntimeReason, locale: string): string | undefined {
  const de = isDe(locale);
  if (reason.source === 'SERVICE_CASE') {
    return de ? 'Servicefall öffnen' : 'Open service case';
  }
  if (reason.source === 'TASK') {
    return de ? 'Aufgabe bearbeiten' : 'Work task';
  }
  if (reason.category === 'cleaning' || reason.source === 'vehicle-cleaning-status') {
    return de ? 'Reinigung planen' : 'Schedule cleaning';
  }
  if (reason.category === 'compliance') {
    return de ? 'Compliance prüfen' : 'Review compliance';
  }
  if (reason.category === 'damage') {
    return de ? 'Schaden prüfen' : 'Review damage';
  }
  if (resolveRuntimeReasonDisplayGroup(reason) === 'technical_block') {
    return de ? 'Health prüfen' : 'Review health';
  }
  if (reason.category === 'handover' || reason.source?.startsWith('booking-runtime:')) {
    return de ? 'Übergabe prüfen' : 'Review handover';
  }
  return undefined;
}

function baseReadableLabel(reason: RuntimeReason, locale: string): string {
  const formatted = formatUserFacingReasonLabel(reason, locale === 'de' ? 'de' : 'en');
  const sanitized = stripVisibleUuidText(formatted);
  if (sanitized) return sanitized;
  const [en, de] = CATEGORY_FALLBACK_LABEL[reason.category] ?? CATEGORY_FALLBACK_LABEL.unknown;
  return isDe(locale) ? de : en;
}

/**
 * The user-facing label for a runtime reason. Always the readable title; the
 * technical `source` is never appended. Falls back to a category label only
 * when the reason carries no title at all.
 */
export function formatRuntimeReasonLabel(reason: RuntimeReason, locale: string): string {
  const title = baseReadableLabel(reason, locale);
  if (reason.source === 'TASK' && reason.parentReasonId) {
    const prefix = isDe(locale) ? 'Aufgabe' : 'Task';
    return `${prefix}: ${title}`;
  }
  return title;
}

/**
 * Debug-only provenance for the pill `title` attribute / tooltip. Keeps the
 * source discoverable on hover without polluting the visible label.
 */
export function runtimeReasonTooltip(reason: RuntimeReason, locale: string): string | undefined {
  const label = formatRuntimeReasonLabel(reason, locale);
  const sourceLabel = runtimeReasonSourceLabel(reason, locale);
  const workStatus = formatWorkStatusLabel(reason.status, locale);
  const action = runtimeReasonActionHint(reason, locale);
  const groupLabel = runtimeReasonDisplayGroupLabel(resolveRuntimeReasonDisplayGroup(reason), locale);

  const parts = [label, `${isDe(locale) ? 'Kategorie' : 'Category'}: ${groupLabel}`];
  if (sourceLabel) parts.push(`${isDe(locale) ? 'Quelle' : 'Source'}: ${sourceLabel}`);
  if (workStatus) parts.push(`${isDe(locale) ? 'Arbeitsstatus' : 'Work status'}: ${workStatus}`);
  if (action) parts.push(`${isDe(locale) ? 'Aktion' : 'Action'}: ${action}`);
  if (reason.source) {
    parts.push(`${isDe(locale) ? 'Technisch' : 'Technical'}: ${reason.source}`);
  }
  return parts.join(' · ');
}

export function buildRuntimeReasonDisplayRow(
  reason: RuntimeReason,
  locale: string,
  options?: { isChild?: boolean; parentReasonId?: string },
): RuntimeReasonDisplayRow {
  const group = resolveRuntimeReasonDisplayGroup(reason);
  return {
    reason,
    group,
    groupLabel: runtimeReasonDisplayGroupLabel(group, locale),
    label: formatRuntimeReasonLabel(reason, locale),
    sourceLabel: runtimeReasonSourceLabel(reason, locale),
    actionHint: runtimeReasonActionHint(reason, locale),
    workStatusLabel: formatWorkStatusLabel(reason.status, locale),
    isChild: options?.isChild ?? Boolean(reason.parentReasonId),
    parentReasonId: options?.parentReasonId ?? reason.parentReasonId,
  };
}

function sortDisplayRows(rows: RuntimeReasonDisplayRow[]): RuntimeReasonDisplayRow[] {
  const groupRank = new Map(DISPLAY_GROUP_ORDER.map((group, index) => [group, index]));
  return [...rows].sort((a, b) => {
    const groupDiff = (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
    if (groupDiff !== 0) return groupDiff;
    if (a.isChild !== b.isChild) return a.isChild ? 1 : -1;
    if (a.reason.blocking !== b.reason.blocking) return a.reason.blocking ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Groups reasons for display while preserving parent/child links between
 * service cases and linked tasks.
 */
export function groupDisplayReasons(
  reasons: RuntimeReason[],
  locale: string,
): RuntimeReasonDisplayGroupView[] {
  const deduped = dedupeDisplayReasons(reasons);
  const reasonById = new Map(deduped.map((reason) => [reason.id, reason]));
  const rows: RuntimeReasonDisplayRow[] = [];
  const consumedChildIds = new Set<string>();

  for (const reason of deduped) {
    if (reason.parentReasonId) {
      const parent = reasonById.get(reason.parentReasonId);
      if (parent) consumedChildIds.add(reason.id);
    }
  }

  for (const reason of deduped) {
    if (reason.parentReasonId && consumedChildIds.has(reason.id)) {
      continue;
    }

    rows.push(buildRuntimeReasonDisplayRow(reason, locale));

    for (const child of deduped) {
      if (child.parentReasonId !== reason.id) continue;
      rows.push(
        buildRuntimeReasonDisplayRow(child, locale, {
          isChild: true,
          parentReasonId: reason.id,
        }),
      );
    }
  }

  const grouped = new Map<RuntimeReasonDisplayGroup, RuntimeReasonDisplayRow[]>();
  for (const row of sortDisplayRows(rows)) {
    const bucket = grouped.get(row.group) ?? [];
    bucket.push(row);
    grouped.set(row.group, bucket);
  }

  return DISPLAY_GROUP_ORDER
    .filter((group) => grouped.has(group))
    .map((group) => ({
      id: group,
      label: runtimeReasonDisplayGroupLabel(group, locale),
      rows: grouped.get(group) ?? [],
    }));
}

export function buildRuntimeReasonDisplayRows(
  reasons: RuntimeReason[],
  locale: string,
): RuntimeReasonDisplayRow[] {
  return groupDisplayReasons(reasons, locale).flatMap((group) => group.rows);
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
    if (reason.source && GENERIC_SOURCES.has(reason.source)) {
      if (reason.source === 'vehicle-runtime') continue;
      if (reason.source === 'dashboard-health-risk' && hasConcreteHealth) continue;
    }

    const operationalKey = [
      reason.serviceCaseId ?? '',
      reason.taskId ?? '',
      reason.parentReasonId ?? '',
    ].join(':');
    const dedupeKey = `${reason.category}:${normalizeTitle(formatRuntimeReasonLabel(reason, 'de'))}:${operationalKey}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(reason);
  }
  return semanticDedupeDisplayReasons(result, 'de');
}

/**
 * Drops shorter/generic labels dominated by a more specific reason label
 * (e.g. "Service überfällig" when "Service überfällig seit 117 Tagen (HM/OEM)" exists).
 */
export function semanticDedupeDisplayReasons(
  reasons: RuntimeReason[],
  locale: string,
): RuntimeReason[] {
  const labeled = reasons
    .map((reason) => ({
      reason,
      label: normalizeTitle(formatRuntimeReasonLabel(reason, locale)),
    }))
    .filter((entry) => entry.label.length > 0);

  labeled.sort((a, b) => b.label.length - a.label.length);

  const kept: RuntimeReason[] = [];
  const keptLabels: string[] = [];

  for (const { reason, label } of labeled) {
    if (reason.parentReasonId) {
      kept.push(reason);
      keptLabels.push(label);
      continue;
    }

    const dominated = keptLabels.some(
      (keptLabel) => keptLabel !== label && keptLabel.includes(label) && keptLabel.length > label.length,
    );
    if (dominated) continue;

    const dominatedIndices: number[] = [];
    keptLabels.forEach((keptLabel, index) => {
      if (keptLabel !== label && label.includes(keptLabel) && label.length > keptLabel.length) {
        dominatedIndices.push(index);
      }
    });
    for (let i = dominatedIndices.length - 1; i >= 0; i -= 1) {
      const index = dominatedIndices[i]!;
      kept.splice(index, 1);
      keptLabels.splice(index, 1);
    }

    kept.push(reason);
    keptLabels.push(label);
  }

  return kept;
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

export function isServiceBlockingReason(reason: RuntimeReason): boolean {
  return reason.reasonCode === SERVICE_CASE_RUNTIME_REASON_CODE || reason.source === 'SERVICE_CASE';
}

export function isTaskBlockingReason(reason: RuntimeReason): boolean {
  return reason.reasonCode === TASK_RUNTIME_REASON_CODE || reason.source === 'TASK';
}
