import { createHash } from 'crypto';
import type { DocumentActionPlan } from './document-action-plan.types';
import type { DocumentFollowUpSuggestionRule } from './document-schema-registry.types';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestion,
  type DocumentFollowUpSuggestionType,
  type DocumentFollowUpTargetEntity,
} from './document-follow-up-suggestion.types';
import { ARCHIVE_SEMANTIC_ACTIONS } from './document-action-planner.archive-rules';
import { DAMAGE_SEMANTIC_ACTIONS } from './document-action-planner.damage-rules';
import { FINE_SEMANTIC_ACTIONS } from './document-action-planner.fine-rules';
import { FINANCE_SEMANTIC_ACTIONS } from './document-action-planner.invoice-rules';
import { INSPECTION_SEMANTIC_ACTIONS } from './document-action-planner.inspection-rules';
import { TECHNICAL_SEMANTIC_ACTIONS } from './document-action-planner.technical-rules';

export type BuildFollowUpSuggestionsInput = {
  extractionId: string;
  plan: DocumentActionPlan;
  confirmedData: Record<string, unknown>;
  registryRules?: readonly DocumentFollowUpSuggestionRule[];
};

const INFORMATIONAL_ONLY_TYPES = new Set<DocumentFollowUpSuggestionType>([
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
]);

const SEMANTIC_ACTION_TO_TYPE: Record<string, DocumentFollowUpSuggestionType> = {
  [ARCHIVE_SEMANTIC_ACTIONS.NO_AUTOMATIC_OUTREACH]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
  [ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_REMINDER]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
  SUGGEST_ENTITY_LINK: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.ASSIGN_RESPONSIBLE_USER,
  [FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_ASSIGNMENT]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
  [FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
  [FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
  [INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
  [INSPECTION_SEMANTIC_ACTIONS.SUGGEST_REINSPECTION]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
  [DAMAGE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
  [DAMAGE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_NOTIFICATION]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW,
  [TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_TIRE_FOLLOWUP]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
  [TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_BRAKE_FOLLOWUP]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
  [TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_BATTERY_FOLLOWUP]: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
};

const REGISTRY_TRIGGER_TO_TYPE: Record<
  DocumentFollowUpSuggestionRule['trigger'],
  DocumentFollowUpSuggestionType
> = {
  missing_driver: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
  missing_customer: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
  missing_booking: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.CREATE_TASK,
  missing_vendor: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
  deadline_detected: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
  duplicate_reference: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.CREATE_TASK,
};

function stableSuggestionId(actionPlanId: string, generatedByRule: string): string {
  return createHash('sha256')
    .update(`${actionPlanId}:${generatedByRule}`)
    .digest('hex')
    .slice(0, 20);
}

function readEntityLinkIds(confirmedData: Record<string, unknown>) {
  const links = readAcceptedEntityLinks(confirmedData);
  const byType = new Map(links.map((link) => [link.entityType, link.entityId]));
  return {
    vehicleId: byType.get('vehicle') ?? null,
    bookingId: byType.get('booking') ?? null,
    customerId: byType.get('customer') ?? null,
    driverCustomerId: byType.get('driver') ?? byType.get('driver_customer') ?? null,
    vendorId: byType.get('vendor') ?? byType.get('partner') ?? null,
  };
}

function evaluateRegistryTrigger(
  trigger: DocumentFollowUpSuggestionRule['trigger'],
  confirmedData: Record<string, unknown>,
): boolean {
  const links = readEntityLinkIds(confirmedData);
  switch (trigger) {
    case 'missing_driver':
      return !links.driverCustomerId;
    case 'missing_customer':
      return !links.customerId;
    case 'missing_booking':
      return !links.bookingId;
    case 'missing_vendor':
      return !links.vendorId;
    case 'deadline_detected':
      return hasDetectedDeadline(confirmedData);
    case 'duplicate_reference':
      return Boolean(confirmedData.duplicateReferenceFineId || confirmedData.duplicateVendorInvoiceId);
    default:
      return false;
  }
}

function hasDetectedDeadline(confirmedData: Record<string, unknown>): boolean {
  if (typeof confirmedData.dueDate === 'string' && confirmedData.dueDate.trim()) return true;
  if (Array.isArray(confirmedData.deadlines) && confirmedData.deadlines.length > 0) return true;
  return false;
}

function readSuggestedDueAt(
  confirmedData: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  type: DocumentFollowUpSuggestionType,
): { suggestedDueAt: string | null; dueDateConfirmed: boolean } {
  if (type !== DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE) {
    return { suggestedDueAt: null, dueDateConfirmed: false };
  }
  if (typeof confirmedData.dueDate === 'string' && confirmedData.dueDate.trim()) {
    return { suggestedDueAt: confirmedData.dueDate.trim(), dueDateConfirmed: true };
  }
  const deadlineRows = metadata?.deadlineSuggestions;
  if (Array.isArray(deadlineRows) && deadlineRows.length > 0) {
    const first = deadlineRows[0] as { date?: string };
    if (typeof first.date === 'string' && first.date.trim()) {
      return { suggestedDueAt: first.date.trim(), dueDateConfirmed: false };
    }
  }
  return { suggestedDueAt: null, dueDateConfirmed: false };
}

function resolveTargetEntity(
  type: DocumentFollowUpSuggestionType,
  confirmedData: Record<string, unknown>,
): DocumentFollowUpTargetEntity | null {
  const links = readEntityLinkIds(confirmedData);
  switch (type) {
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT:
      return links.customerId
        ? { entityType: 'customer', entityId: links.customerId, label: 'Kunde' }
        : { entityType: 'customer', entityId: null, label: 'Kunde zuordnen' };
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT:
      return links.driverCustomerId
        ? { entityType: 'driver', entityId: links.driverCustomerId, label: 'Fahrer' }
        : { entityType: 'driver', entityId: null, label: 'Fahrer zuordnen' };
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW:
      return links.vendorId
        ? { entityType: 'vendor', entityId: links.vendorId, label: 'Lieferant' }
        : { entityType: 'invoice', entityId: null, label: 'Zahlung prüfen' };
    default:
      if (links.vehicleId) {
        return { entityType: 'vehicle', entityId: links.vehicleId, label: 'Fahrzeug' };
      }
      return null;
  }
}

function buildSuggestionRow(input: {
  extractionId: string;
  plan: DocumentActionPlan;
  generatedByRule: string;
  type: DocumentFollowUpSuggestionType;
  title: string;
  rationale: string;
  confirmedData: Record<string, unknown>;
  now: string;
}): DocumentFollowUpSuggestion {
  const due = readSuggestedDueAt(input.confirmedData, input.plan.metadata, input.type);
  return {
    suggestionId: stableSuggestionId(input.plan.planId, input.generatedByRule),
    extractionId: input.extractionId,
    actionPlanId: input.plan.planId,
    type: input.type,
    title: input.title,
    rationale: input.rationale,
    suggestedDueAt: due.suggestedDueAt,
    dueDateConfirmed: due.dueDateConfirmed,
    targetEntity: resolveTargetEntity(input.type, input.confirmedData),
    status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
    generatedByRule: input.generatedByRule,
    acceptedByUserId: null,
    resultingEntityId: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

const SEMANTIC_ACTION_TITLES: Record<string, string> = {
  SUGGEST_DEADLINE_REMINDER: 'Bußgeldfrist prüfen',
  SUGGEST_DUE_DATE_TASK: 'Frist prüfen',
  SUGGEST_PAYMENT_REVIEW: 'Rechnung freigeben',
  SUGGEST_DEFECT_REMEDIATION: 'TÜV-Mangel beseitigen',
  SUGGEST_REINSPECTION: 'Fahrzeug prüfen',
  SUGGEST_VEHICLE_INSPECTION: 'Fahrzeug prüfen',
  SUGGEST_INSURANCE_NOTIFICATION: 'Versicherung prüfen',
  SUGGEST_TIRE_FOLLOWUP: 'Werkstatttermin vereinbaren',
  SUGGEST_BRAKE_FOLLOWUP: 'Werkstatttermin vereinbaren',
  SUGGEST_BATTERY_FOLLOWUP: 'Werkstatttermin vereinbaren',
  SUGGEST_DRIVER_ASSIGNMENT: 'Fahrerzuordnung prüfen',
  SUGGEST_ENTITY_LINK: 'Fehlende Dokumentdaten ergänzen',
  NO_AUTOMATIC_OUTREACH: 'Kein automatischer Kontakt',
};

function semanticActionTitle(semanticAction: string): string {
  return (
    SEMANTIC_ACTION_TITLES[semanticAction] ??
    semanticAction
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function buildFollowUpSuggestions(
  input: BuildFollowUpSuggestionsInput,
): DocumentFollowUpSuggestion[] {
  const now = new Date().toISOString();
  const byRule = new Map<string, DocumentFollowUpSuggestion>();

  for (const action of input.plan.actions) {
    if (action.requirement === 'REQUIRED') continue;
    const type = SEMANTIC_ACTION_TO_TYPE[action.semanticAction];
    if (!type) continue;
    const generatedByRule = `semantic:${action.semanticAction}`;
    byRule.set(
      generatedByRule,
      buildSuggestionRow({
        extractionId: input.extractionId,
        plan: input.plan,
        generatedByRule,
        type,
        title:
          type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP
            ? 'Kein automatischer Kontakt'
            : semanticActionTitle(action.semanticAction),
        rationale:
          type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP
            ? 'Es werden keine automatischen Kontakte oder Aufgaben erstellt.'
            : `Vorgeschlagene Nachverfolgung aus Aktionsplan (${action.semanticAction}).`,
        confirmedData: input.confirmedData,
        now,
      }),
    );
  }

  for (const rule of input.registryRules ?? []) {
    if (!evaluateRegistryTrigger(rule.trigger, input.confirmedData)) continue;
    const type = REGISTRY_TRIGGER_TO_TYPE[rule.trigger];
    const generatedByRule = `registry:${rule.code}`;
    byRule.set(
      generatedByRule,
      buildSuggestionRow({
        extractionId: input.extractionId,
        plan: input.plan,
        generatedByRule,
        type,
        title: rule.message,
        rationale: `${rule.message} (Regel ${rule.code}).`,
        confirmedData: input.confirmedData,
        now,
      }),
    );
  }

  const metadata = input.plan.metadata ?? {};
  const deadlineSuggestions = metadata.deadlineSuggestions;
  if (Array.isArray(deadlineSuggestions)) {
    deadlineSuggestions.forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      const deadline = row as { label?: string; date?: string };
      if (!deadline.date) return;
      const generatedByRule = `metadata:deadline:${index}`;
      byRule.set(
        generatedByRule,
        buildSuggestionRow({
          extractionId: input.extractionId,
          plan: input.plan,
          generatedByRule,
          type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
          title: deadline.label?.trim() || 'Frist prüfen',
          rationale: `Erkannte Frist ${deadline.date} — bitte manuell bestätigen.`,
          confirmedData: input.confirmedData,
          now,
        }),
      );
    });
  }

  if (byRule.size === 0) {
    byRule.set(
      'default:NO_FOLLOW_UP',
      buildSuggestionRow({
        extractionId: input.extractionId,
        plan: input.plan,
        generatedByRule: 'default:NO_FOLLOW_UP',
        type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
        title: 'Keine Nachverfolgung erforderlich',
        rationale: 'Für diesen Aktionsplan sind keine zusätzlichen Nachverfolgungen vorgesehen.',
        confirmedData: input.confirmedData,
        now,
      }),
    );
  }

  return [...byRule.values()].sort((a, b) => a.generatedByRule.localeCompare(b.generatedByRule));
}

export function mergeFollowUpSuggestionsIdempotent(
  existing: DocumentFollowUpSuggestion[],
  generated: DocumentFollowUpSuggestion[],
): DocumentFollowUpSuggestion[] {
  const preserved = existing.filter(
    (row) =>
      row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED ||
      row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.DISMISSED,
  );
  const preservedIds = new Set(preserved.map((row) => row.suggestionId));
  const next = generated
    .filter((row) => !preservedIds.has(row.suggestionId))
    .map((row) => {
      const prior = existing.find((entry) => entry.suggestionId === row.suggestionId);
      if (!prior) return row;
      if (prior.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED) {
        return { ...row, createdAt: prior.createdAt, updatedAt: row.updatedAt };
      }
      return prior;
    });
  return [...preserved, ...next].sort((a, b) => a.generatedByRule.localeCompare(b.generatedByRule));
}

export function isFollowUpSuggestionAcceptable(
  suggestion: Pick<DocumentFollowUpSuggestion, 'type' | 'status'>,
): boolean {
  if (suggestion.status !== DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED) return false;
  return !INFORMATIONAL_ONLY_TYPES.has(suggestion.type);
}
