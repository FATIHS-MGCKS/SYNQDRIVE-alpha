import type { DocumentActionType, DocumentEntityType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
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

export type DocumentActionPreviewRow = {
  sequence: number;
  actionType: DocumentActionType | 'LINK_VEHICLE';
  previewStatus: DocumentActionPreviewStatus;
  requirement: PlannedDocumentActionInput['requirement'];
  targetEntityType?: DocumentEntityType | null;
  targetEntityId?: string | null;
  preview: Record<string, unknown>;
  blocked: boolean;
};

function mapActionPreviewStatus(
  action: PlannedDocumentActionInput,
  planBlocked: boolean,
): DocumentActionPreviewStatus {
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
    actionType: 'LINK_VEHICLE',
    previewStatus: 'WOULD_LINK',
    requirement: 'INFORMATIONAL',
    targetEntityType: 'VEHICLE',
    targetEntityId: vehicleEntityId,
    preview: {
      wouldLink: 'VEHICLE',
      entityId: vehicleEntityId,
    },
    blocked: false,
  };
}

export function buildDocumentActionPreviewRows(
  plannerResult: DocumentActionPlannerResult,
  vehicleEntityId: string | null,
): DocumentActionPreviewRow[] {
  const planBlocked = plannerResult.planDraft.isBlocked;
  const rows: DocumentActionPreviewRow[] = [];

  const linkPreview = buildVehicleLinkPreview(vehicleEntityId, 0);
  if (linkPreview) {
    rows.push({ ...linkPreview, sequence: 1 });
  }

  const baseSequence = rows.length;
  plannerResult.actions.forEach((action, index) => {
    rows.push({
      sequence: baseSequence + index + 1,
      actionType: action.actionType,
      previewStatus: mapActionPreviewStatus(action, planBlocked),
      requirement: action.requirement ?? 'REQUIRED',
      targetEntityType: action.targetEntityType ?? null,
      targetEntityId: action.targetEntityId ?? null,
      preview: (action.previewPayload ?? action.inputPayload) as Record<string, unknown>,
      blocked:
        planBlocked &&
        action.actionType !== 'ARCHIVE_ONLY' &&
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
