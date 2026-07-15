import type { TaskPriority } from '@prisma/client';
import type {
  TaskAutomationActivationStrategy,
  TaskAutomationAssignmentStrategy,
  TaskAutomationCatalogKey,
  TaskAutomationDueStrategy,
  TaskAutomationRuleDefinition,
} from './task-automation-rule.types';

/** Operational rules that should warn before org-level deactivation. */
export const CRITICAL_TASK_AUTOMATION_CATALOG_KEYS = new Set<TaskAutomationCatalogKey>([
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_PACKAGE_INCOMPLETE',
  'INVOICE_PAYMENT_CHECK',
  'VEHICLE_CLEANING_REQUIRED',
]);

const ACTIVATION_LABELS_DE: Record<TaskAutomationActivationStrategy, string> = {
  ON_BOOKING_CONFIRMED: 'Bei Buchungsbestätigung',
  ON_BOOKING_ACTIVE: 'Bei aktiver Buchung',
  ON_DOCUMENT_PACKAGE_GAP: 'Bei fehlenden Pflichtdokumenten',
  ON_INVOICE_PAYMENT_OPEN: 'Bei offener Rechnung',
  ON_VEHICLE_NEEDS_CLEANING: 'Wenn Fahrzeugreinigung erforderlich ist',
  ON_INSIGHT_MATERIALIZE: 'Bei kritischem Fahrzeug-Insight',
  ON_VENDOR_REPAIR_REQUEST: 'Bei Reparaturanfrage',
  ON_LIFECYCLE_EVENT: 'Bei Lifecycle-Ereignis',
  MANUAL_ONLY: 'Nur manuell',
};

const DUE_LABELS_DE: Record<TaskAutomationDueStrategy, string> = {
  BOOKING_PREPARATION_TIMING: 'Vor geplanter Übergabe (Buchungsfenster)',
  BOOKING_PICKUP_MILESTONE: 'Zum Pickup-Zeitpunkt',
  BOOKING_RETURN_MILESTONE: 'Zum Return-Zeitpunkt',
  INVOICE_DUE_DATE: 'Zum Rechnungsfälligkeitsdatum',
  INSIGHT_TIME_CONTEXT: 'Aus Insight-Zeitkontext',
  IMMEDIATE: 'Sofort',
  NONE: 'Kein separates Fälligkeitsdatum',
};

const ASSIGNMENT_LABELS_DE: Record<TaskAutomationAssignmentStrategy, string> = {
  UNASSIGNED: 'Nicht zugewiesen',
  STATION_FROM_BOOKING: 'Station der Buchung',
  INHERIT_FROM_CONTEXT: 'Aus Kontext übernehmen',
};

const PRIORITY_LABELS_DE: Record<TaskPriority, string> = {
  LOW: 'Niedrig',
  NORMAL: 'Normal',
  HIGH: 'Hoch',
  CRITICAL: 'Kritisch',
};

const CATEGORY_LABELS_DE: Record<string, string> = {
  Booking: 'Buchung',
  Documents: 'Dokumente',
  invoice: 'Rechnungen',
  Vehicle: 'Fahrzeug',
  Insights: 'Fahrzeug-Insights',
  Vendor: 'Servicepartner',
};

export function isCriticalTaskAutomationRule(rule: TaskAutomationRuleDefinition): boolean {
  return rule.catalogKey != null && CRITICAL_TASK_AUTOMATION_CATALOG_KEYS.has(rule.catalogKey);
}

export function labelActivationStrategyDe(strategy: TaskAutomationActivationStrategy): string {
  return ACTIVATION_LABELS_DE[strategy] ?? strategy;
}

export function labelDueStrategyDe(strategy: TaskAutomationDueStrategy): string {
  return DUE_LABELS_DE[strategy] ?? strategy;
}

export function labelAssignmentStrategyDe(strategy: string | null | undefined): string {
  if (!strategy) return '—';
  return ASSIGNMENT_LABELS_DE[strategy as TaskAutomationAssignmentStrategy] ?? strategy;
}

export function labelPriorityDe(priority: TaskPriority | null | undefined): string {
  if (!priority) return '—';
  return PRIORITY_LABELS_DE[priority] ?? priority;
}

export function labelCategoryDe(category: string): string {
  return CATEGORY_LABELS_DE[category] ?? category;
}

export function formatOffsetMinutesDe(minutes: number): string {
  if (minutes === 0) return 'Zum Standardzeitpunkt';
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? 'früher' : 'später';
  if (abs % 1_440 === 0) {
    const days = abs / 1_440;
    return `${days} Tag${days === 1 ? '' : 'e'} ${sign}`;
  }
  if (abs % 60 === 0) {
    const hours = abs / 60;
    return `${hours} Stunde${hours === 1 ? '' : 'n'} ${sign}`;
  }
  return `${abs} Minute${abs === 1 ? '' : 'n'} ${sign}`;
}

export function describeActivationTimingDe(
  strategy: TaskAutomationActivationStrategy,
  offsetMinutes: number,
): string {
  const base = labelActivationStrategyDe(strategy);
  if (offsetMinutes === 0) return base;
  return `${base} (${formatOffsetMinutesDe(offsetMinutes)})`;
}

export function describeDueTimingDe(
  strategy: TaskAutomationDueStrategy,
  offsetMinutes: number,
): string {
  const base = labelDueStrategyDe(strategy);
  if (offsetMinutes === 0) return base;
  return `${base} (${formatOffsetMinutesDe(offsetMinutes)})`;
}

export function describeAutoResolveDe(condition: string): string {
  return condition
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((token) => {
      const map: Record<string, string> = {
        HANDOVER_PICKUP_COMPLETED: 'Übergabe abgeschlossen',
        HANDOVER_RETURN_COMPLETED: 'Rücknahme abgeschlossen',
        BOOKING_CANCELLED: 'Buchung storniert',
        BOOKING_NO_SHOW: 'No-Show',
        DOCUMENT_PACKAGE_COMPLETE: 'Dokumentenpaket vollständig',
        PAYMENT_RECEIVED: 'Zahlung eingegangen',
        INVOICE_CANCELLED: 'Rechnung storniert',
        INVOICE_VOIDED: 'Rechnung annulliert',
        INVOICE_CREDITED: 'Gutschrift verbucht',
        VEHICLE_CLEANED: 'Fahrzeug gereinigt',
        INSIGHT_RESOLVED: 'Insight behoben',
        REPAIR_COMPLETED: 'Reparatur abgeschlossen',
      };
      return map[token] ?? token.replaceAll('_', ' ').toLowerCase();
    })
    .join(' · ');
}

export function describeEscalationDe(
  rule: TaskAutomationRuleDefinition,
  escalationConfig: Record<string, unknown> | null,
): string {
  if (escalationConfig && Object.keys(escalationConfig).length > 0) {
    return 'Organisationsspezifische Eskalation konfiguriert';
  }

  const ruleConfig = Object.fromEntries(
    rule.configurableFields.map((field) => [field.field, field.defaultValue]),
  );

  if (rule.catalogKey === 'INVOICE_PAYMENT_CHECK') {
    const days = ruleConfig.criticalOverdueAfterDays;
    return typeof days === 'number'
      ? `Priorität steigt nach ${days} überfälligen Tagen`
      : 'Priorität steigt bei Überfälligkeit';
  }

  if (rule.catalogKey === 'VEHICLE_CLEANING_REQUIRED') {
    const hours = ruleConfig.urgentBeforePickupHours;
    return typeof hours === 'number'
      ? `Dringlichkeit ${hours}h vor Übergabe`
      : 'Dringlichkeit vor Übergabe';
  }

  if (rule.defaultPriority === 'HIGH' || rule.defaultPriority === 'CRITICAL') {
    return `Standardpriorität ${labelPriorityDe(rule.defaultPriority)}`;
  }

  return 'Keine zusätzliche Eskalation';
}

export function describeChecklistTemplateDe(taskType: string | null): string {
  if (!taskType) return 'Keine Checkliste';
  const map: Record<string, string> = {
    BOOKING_PREPARATION: 'Vorbereitung (SynqDrive-Standard)',
    BOOKING_PICKUP: 'Übergabe (SynqDrive-Standard)',
    BOOKING_RETURN: 'Rücknahme (SynqDrive-Standard)',
    DOCUMENT_REVIEW: 'Dokumentenprüfung (SynqDrive-Standard)',
    INVOICE_REQUIRED: 'Zahlungsprüfung (SynqDrive-Standard)',
    VEHICLE_CLEANING: 'Reinigung (SynqDrive-Standard)',
    VEHICLE_SERVICE: 'Service (SynqDrive-Standard)',
    TIRE_CHECK: 'Reifenprüfung (SynqDrive-Standard)',
    BRAKE_CHECK: 'Bremsenprüfung (SynqDrive-Standard)',
    BATTERY_CHECK: 'Batterieprüfung (SynqDrive-Standard)',
    REPAIR: 'Reparatur (SynqDrive-Standard)',
  };
  return map[taskType] ?? `${taskType} (SynqDrive-Standard)`;
}
