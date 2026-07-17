import type { DocumentActionType, DocumentEntityType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import {
  ARCHIVE_ONLY_SEMANTIC_ACTIONS,
  extractSemanticAction,
} from './document-action-planner.archive-rules';
import {
  extractFineSemanticAction,
  FINE_SEMANTIC_ACTIONS,
} from './document-action-planner.fine-rules';
import {
  extractFinanceSemanticAction,
  FINANCE_SEMANTIC_ACTIONS,
} from './document-action-planner.invoice-rules';
import {
  extractMaintenanceSemanticAction,
  MAINTENANCE_SEMANTIC_ACTIONS,
} from './document-action-planner.maintenance-rules';
import { listActionTemplatesForRoutingType } from './document-action-planner.catalog';
import type {
  DocumentActionBlockingReason,
  DocumentActionPlannerResult,
} from './document-action-planner.types';
import type { DocumentActionPreviewStatus } from './dto/public-document-action-plan.dto';

const PREVIEW_STATUS_BY_ACTION_TYPE: Record<DocumentActionType, DocumentActionPreviewStatus> = {
  CREATE_SERVICE_EVENT: 'WOULD_CREATE',
  UPDATE_VEHICLE_INSPECTION: 'WOULD_UPDATE',
  CREATE_INVOICE: 'WOULD_CREATE',
  CREATE_FINE: 'WOULD_CREATE',
  CREATE_DAMAGE: 'WOULD_CREATE',
  RECORD_TIRE_MEASUREMENT: 'WOULD_CREATE',
  RECORD_BRAKE_EVIDENCE: 'WOULD_CREATE',
  RECORD_BATTERY_EVIDENCE: 'WOULD_CREATE',
  ARCHIVE_ONLY: 'ARCHIVE_ONLY',
  SUGGEST_TASK: 'WOULD_SUGGEST',
};

const SEMANTIC_PREVIEW_ACTION_TYPES = new Set<string>([
  ...Object.values(ARCHIVE_ONLY_SEMANTIC_ACTIONS),
  ...Object.values(FINE_SEMANTIC_ACTIONS),
  ...Object.values(FINANCE_SEMANTIC_ACTIONS),
  ...Object.values(MAINTENANCE_SEMANTIC_ACTIONS),
]);

export type DocumentActionPreviewActionType =
  | DocumentActionType
  | (typeof ARCHIVE_ONLY_SEMANTIC_ACTIONS)[keyof typeof ARCHIVE_ONLY_SEMANTIC_ACTIONS]
  | (typeof FINE_SEMANTIC_ACTIONS)[keyof typeof FINE_SEMANTIC_ACTIONS]
  | (typeof FINANCE_SEMANTIC_ACTIONS)[keyof typeof FINANCE_SEMANTIC_ACTIONS]
  | (typeof MAINTENANCE_SEMANTIC_ACTIONS)[keyof typeof MAINTENANCE_SEMANTIC_ACTIONS];

export type DocumentActionPreviewRow = {
  sequence: number;
  actionType: DocumentActionPreviewActionType;
  previewStatus: DocumentActionPreviewStatus;
  requirement: PlannedDocumentActionInput['requirement'];
  targetEntityType?: DocumentEntityType | null;
  targetEntityId?: string | null;
  preview: Record<string, unknown>;
  blocked: boolean;
};

function resolvePreviewActionType(action: PlannedDocumentActionInput): DocumentActionPreviewActionType {
  const payload = (action.previewPayload ?? action.inputPayload) as Record<string, unknown>;
  const maintenanceSemantic = extractMaintenanceSemanticAction(payload);
  if (maintenanceSemantic) return maintenanceSemantic;
  const financeSemantic = extractFinanceSemanticAction(payload);
  if (financeSemantic) return financeSemantic;
  const fineSemantic = extractFineSemanticAction(payload);
  if (fineSemantic) return fineSemantic;
  const semantic = extractSemanticAction(payload);
  if (semantic) return semantic;
  return action.actionType;
}

function mapActionPreviewStatus(
  action: PlannedDocumentActionInput,
  planBlocked: boolean,
): DocumentActionPreviewStatus {
  const payload = (action.previewPayload ?? action.inputPayload) as Record<string, unknown>;
  const maintenanceSemantic = extractMaintenanceSemanticAction(payload);
  if (
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT ||
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT ||
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT
  ) {
    return planBlocked ? 'BLOCKED' : 'WOULD_CREATE';
  }
  if (
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE ||
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_BOKRAFT_COMPLIANCE
  ) {
    return planBlocked ? 'BLOCKED' : 'WOULD_UPDATE';
  }
  if (maintenanceSemantic?.startsWith('LINK_')) {
    return 'WOULD_LINK';
  }
  if (
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK ||
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION ||
    maintenanceSemantic === MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_REVIEW
  ) {
    return 'WOULD_SUGGEST';
  }

  const financeSemantic = extractFinanceSemanticAction(payload);
  if (
    financeSemantic === FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT ||
    financeSemantic === FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT
  ) {
    return planBlocked ? 'BLOCKED' : 'WOULD_CREATE';
  }
  if (financeSemantic?.startsWith('LINK_')) {
    return 'WOULD_LINK';
  }
  if (
    financeSemantic === FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW ||
    financeSemantic === FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK
  ) {
    return 'WOULD_SUGGEST';
  }
  if (financeSemantic === FINANCE_SEMANTIC_ACTIONS.ARCHIVE_ONLY) {
    return 'ARCHIVE_ONLY';
  }

  const fineSemantic = extractFineSemanticAction(payload);
  if (fineSemantic === FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT) {
    return planBlocked ? 'BLOCKED' : 'WOULD_CREATE';
  }
  if (fineSemantic?.startsWith('LINK_')) {
    return 'WOULD_LINK';
  }
  if (
    fineSemantic === FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW ||
    fineSemantic === FINE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_TASK ||
    fineSemantic === FINE_SEMANTIC_ACTIONS.SUGGEST_CUSTOMER_CONTACT
  ) {
    return 'WOULD_SUGGEST';
  }

  const semantic = extractSemanticAction(payload);

  if (semantic === ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT) {
    return 'ARCHIVE_ONLY';
  }
  if (semantic?.startsWith('LINK_')) {
    return 'WOULD_LINK';
  }
  if (semantic === ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW) {
    return 'WOULD_SUGGEST';
  }

  if (action.actionType === 'ARCHIVE_ONLY') {
    return 'ARCHIVE_ONLY';
  }
  if (planBlocked && (action.requirement === 'REQUIRED' || action.requirement === 'OPTIONAL')) {
    return 'BLOCKED';
  }
  return PREVIEW_STATUS_BY_ACTION_TYPE[action.actionType] ?? 'WOULD_CREATE';
}

function buildBlockedTemplatePreviews(
  plannerResult: DocumentActionPlannerResult,
): DocumentActionPreviewRow[] {
  if (plannerResult.planDraft.snapshot.planningMode === 'ARCHIVE_ONLY') {
    return [];
  }
  if (plannerResult.planDraft.snapshot.planningMode === 'MAINTENANCE') {
    return [];
  }

  const routingType = plannerResult.planDraft.snapshot.routingType as string | null | undefined;
  if (!routingType || !plannerResult.planDraft.isBlocked) {
    return [];
  }

  const templates = listActionTemplatesForRoutingType(routingType as any);
  const emittedTypes = new Set(plannerResult.actions.map((action) => action.actionType));
  const rows: DocumentActionPreviewRow[] = [];
  let sequence = 0;

  for (const template of templates) {
    if (emittedTypes.has(template.actionType)) continue;
    if (template.requirement !== 'REQUIRED' && template.requirement !== 'OPTIONAL') continue;
    sequence += 1;
    rows.push({
      sequence,
      actionType: template.actionType,
      previewStatus: 'BLOCKED',
      requirement: template.requirement,
      targetEntityType: template.targetEntityType ?? null,
      targetEntityId: null,
      preview: {
        blocked: true,
        reasonCodes: plannerResult.blockingReasons.map((reason) => reason.code),
      },
      blocked: true,
    });
  }

  return rows;
}

function buildVehicleLinkPreview(
  vehicleEntityId: string | null,
  startSequence: number,
): DocumentActionPreviewRow | null {
  if (!vehicleEntityId) return null;
  return {
    sequence: startSequence,
    actionType: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VEHICLE,
    previewStatus: 'WOULD_LINK',
    requirement: 'INFORMATIONAL',
    targetEntityType: 'VEHICLE',
    targetEntityId: vehicleEntityId,
    preview: {
      wouldLink: 'VEHICLE',
      entityId: vehicleEntityId,
      confirmed: true,
    },
    blocked: false,
  };
}

export function buildDocumentActionPreviewRows(
  plannerResult: DocumentActionPlannerResult,
  vehicleEntityId: string | null,
): DocumentActionPreviewRow[] {
  const planBlocked = plannerResult.planDraft.isBlocked;
  const isArchiveOnlyPlan = plannerResult.planDraft.snapshot.planningMode === 'ARCHIVE_ONLY';
  const isFinePlan = plannerResult.planDraft.snapshot.planningMode === 'FINE';
  const isFinancePlan = plannerResult.planDraft.snapshot.planningMode === 'FINANCE';
  const isMaintenancePlan = plannerResult.planDraft.snapshot.planningMode === 'MAINTENANCE';
  const rows: DocumentActionPreviewRow[] = [];

  if (!isArchiveOnlyPlan && !isFinePlan && !isFinancePlan && !isMaintenancePlan) {
    const linkPreview = buildVehicleLinkPreview(vehicleEntityId, 0);
    if (linkPreview) {
      rows.push({ ...linkPreview, sequence: 1 });
    }
  }

  const baseSequence = rows.length;
  plannerResult.actions.forEach((action, index) => {
    const previewActionType = resolvePreviewActionType(action);
    rows.push({
      sequence: baseSequence + index + 1,
      actionType: previewActionType,
      previewStatus: mapActionPreviewStatus(action, planBlocked),
      requirement: action.requirement ?? 'REQUIRED',
      targetEntityType: action.targetEntityType ?? null,
      targetEntityId: action.targetEntityId ?? null,
      preview: (action.previewPayload ?? action.inputPayload) as Record<string, unknown>,
      blocked:
        planBlocked &&
        action.actionType !== 'ARCHIVE_ONLY' &&
        !SEMANTIC_PREVIEW_ACTION_TYPES.has(String(previewActionType)) &&
        (action.requirement === 'REQUIRED' || action.requirement === 'OPTIONAL'),
    });
  });

  if (planBlocked) {
    const blockedTemplates = buildBlockedTemplatePreviews(plannerResult);
    let nextSequence = rows.length;
    for (const blockedRow of blockedTemplates) {
      nextSequence += 1;
      rows.push({ ...blockedRow, sequence: nextSequence });
    }
  }

  return rows;
}

export function summarizeBlockingReasons(
  blockingReasons: DocumentActionBlockingReason[],
): Array<{ code: string; message: string; source: string }> {
  return blockingReasons.map((reason) => ({
    code: reason.code,
    message: reason.message,
    source: reason.source,
  }));
}
