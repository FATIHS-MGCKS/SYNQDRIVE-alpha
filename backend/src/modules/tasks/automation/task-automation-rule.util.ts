import type { InsightType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  MATERIALIZATION_AUTOMATION_RULES,
  TASK_AUTOMATION_RULE_CATALOG,
} from './task-automation-rule.catalog';
import type {
  TaskAutomationCatalogKey,
  TaskAutomationMetadataRef,
  TaskAutomationRuleDefinition,
} from './task-automation-rule.types';

const catalogByKey = new Map<TaskAutomationCatalogKey, TaskAutomationRuleDefinition>();
const catalogByRuleId = new Map<string, TaskAutomationRuleDefinition>();
const catalogByInsightType = new Map<InsightType, TaskAutomationRuleDefinition>();

for (const rule of TASK_AUTOMATION_RULE_CATALOG) {
  catalogByRuleId.set(rule.ruleId, rule);
  if (rule.catalogKey) {
    catalogByKey.set(rule.catalogKey, rule);
  }
  if (rule.insightType) {
    catalogByInsightType.set(rule.insightType, rule);
  }
}

export function getAutomationRuleByCatalogKey(
  catalogKey: TaskAutomationCatalogKey,
): TaskAutomationRuleDefinition {
  const rule = catalogByKey.get(catalogKey);
  if (!rule) {
    throw new Error(`Unknown task automation catalog key: ${catalogKey}`);
  }
  return rule;
}

export function getAutomationRuleById(ruleId: string): TaskAutomationRuleDefinition | undefined {
  return catalogByRuleId.get(ruleId);
}

export function requireAutomationRuleById(ruleId: string): TaskAutomationRuleDefinition {
  const rule = getAutomationRuleById(ruleId);
  if (!rule) {
    throw new Error(`Unknown task automation ruleId: ${ruleId}`);
  }
  return rule;
}

export function getAutomationRuleByInsightType(
  insightType: InsightType,
): TaskAutomationRuleDefinition | undefined {
  return catalogByInsightType.get(insightType);
}

export function requireAutomationRuleByInsightType(
  insightType: InsightType,
): TaskAutomationRuleDefinition {
  const rule = getAutomationRuleByInsightType(insightType);
  if (!rule?.catalogKey) {
    throw new Error(`No materialization automation rule for insight type: ${insightType}`);
  }
  return rule;
}

export function listMaterializationAutomationRules(): readonly TaskAutomationRuleDefinition[] {
  return MATERIALIZATION_AUTOMATION_RULES;
}

export function buildAutomationMetadataRef(
  rule: TaskAutomationRuleDefinition | TaskAutomationCatalogKey | string,
  ruleScope: TaskAutomationMetadataRef['ruleScope'] = 'ORG',
): TaskAutomationMetadataRef {
  const resolved =
    typeof rule === 'string' && isCatalogKey(rule)
      ? getAutomationRuleByCatalogKey(rule)
      : typeof rule === 'string'
        ? requireAutomationRuleById(rule)
        : rule;

  return {
    ruleId: resolved.ruleId,
    ruleVersion: resolved.version,
    ruleScope,
  };
}

export function buildAutomationMetadataBlock(
  rule: TaskAutomationRuleDefinition | TaskAutomationCatalogKey | string,
  ruleScope: TaskAutomationMetadataRef['ruleScope'] = 'ORG',
): Prisma.InputJsonValue {
  return buildAutomationMetadataRef(rule, ruleScope) as unknown as Prisma.InputJsonValue;
}

export function automationOutboxIdentity(
  rule: TaskAutomationRuleDefinition | TaskAutomationCatalogKey | string,
): Pick<TaskAutomationMetadataRef, 'ruleId' | 'ruleVersion'> {
  const ref = buildAutomationMetadataRef(rule);
  return { ruleId: ref.ruleId, ruleVersion: ref.ruleVersion };
}

export function getConfigurableNumberDefault(
  rule: TaskAutomationRuleDefinition | TaskAutomationCatalogKey,
  field: string,
  fallback: number,
): number {
  const resolved =
    typeof rule === 'string' ? getAutomationRuleByCatalogKey(rule) : rule;
  const match = resolved.configurableFields.find((f) => f.field === field);
  return typeof match?.defaultValue === 'number' ? match.defaultValue : fallback;
}

export function getConfigurableStringDefault(
  rule: TaskAutomationRuleDefinition | TaskAutomationCatalogKey,
  field: string,
  fallback: string,
): string {
  const resolved =
    typeof rule === 'string' ? getAutomationRuleByCatalogKey(rule) : rule;
  const match = resolved.configurableFields.find((f) => f.field === field);
  return typeof match?.defaultValue === 'string' ? match.defaultValue : fallback;
}

function isCatalogKey(value: string): value is TaskAutomationCatalogKey {
  return catalogByKey.has(value as TaskAutomationCatalogKey);
}

// ─── Dedup key builders (canonical namespaces — audit-stable) ───────────────

export function bookingPreparationDedupKey(bookingId: string): string {
  return `booking:prep:${bookingId}`;
}

export function bookingPickupDedupKey(bookingId: string): string {
  return `booking:pickup:${bookingId}`;
}

export function bookingReturnDedupKey(bookingId: string): string {
  return `booking:return:${bookingId}`;
}

export const LEGACY_CONFIRMED_BOOKING_DEDUP_KEYS = ['booking:document'] as const;

export function legacyConfirmedBookingDedupKeys(bookingId: string): string[] {
  return LEGACY_CONFIRMED_BOOKING_DEDUP_KEYS.map((prefix) => `${prefix}:${bookingId}`);
}

export function confirmedPhaseActiveDedupKeys(bookingId: string): string[] {
  return [
    bookingPreparationDedupKey(bookingId),
    bookingPickupDedupKey(bookingId),
    ...legacyConfirmedBookingDedupKeys(bookingId),
  ];
}

export function activeRentalPhaseDedupKeys(bookingId: string): string[] {
  return [bookingReturnDedupKey(bookingId)];
}

export const INVOICE_PAYMENT_TASK_DEDUP_PREFIX = 'invoice:payment-check:';
export const LEGACY_INVOICE_UNPAID_DEDUP_PREFIX = 'invoice:unpaid:';

export function invoicePaymentCheckDedupKey(invoiceId: string): string {
  return `${INVOICE_PAYMENT_TASK_DEDUP_PREFIX}${invoiceId}`;
}

export function legacyInvoiceUnpaidDedupKey(invoiceId: string): string {
  return `${LEGACY_INVOICE_UNPAID_DEDUP_PREFIX}${invoiceId}`;
}

export const VEHICLE_CLEANING_TASK_DEDUP_PREFIX = 'vehicle:cleaning:' as const;
export const LEGACY_BOOKING_CLEAN_DEDUP_PREFIX = 'booking:clean:' as const;

export function vehicleCleaningDedupKey(vehicleId: string, purposeSuffix: string): string {
  return `${VEHICLE_CLEANING_TASK_DEDUP_PREFIX}${vehicleId}:${purposeSuffix}`;
}

export function legacyBookingCleanDedupKey(bookingId: string): string {
  return `${LEGACY_BOOKING_CLEAN_DEDUP_PREFIX}${bookingId}`;
}

export const SERVICE_OVERDUE_TASK_DEDUP_PREFIX = 'service_overdue:' as const;

export function serviceOverdueDedupKey(vehicleId: string): string {
  return `${SERVICE_OVERDUE_TASK_DEDUP_PREFIX}${vehicleId}`;
}

export function vendorRepairDedupKey(
  vehicleId: string,
  vendorId: string | null | undefined,
  reason: string,
): string {
  return `vendor:repair:${vehicleId}:${vendorId ?? 'none'}:${reason}`;
}

/** Insight bridge sources derived from catalog — no scattered string list in services. */
export const INSIGHT_TASK_BRIDGE_SOURCES = [
  ...new Set(
    MATERIALIZATION_AUTOMATION_RULES.filter((rule) => rule.insightType).map((rule) => rule.source),
  ),
];
