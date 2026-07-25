import { BadRequestException } from '@nestjs/common';
import type { HandoverKind } from '@prisma/client';
import type {
  HandoverDraftStepId,
  HandoverSessionDraftPayload,
} from './handover-session-draft.types';

export interface HandoverDraftStepValidationIssue {
  step: HandoverDraftStepId;
  field: string;
  message: string;
}

export function validateHandoverDraftStep(
  step: HandoverDraftStepId,
  kind: HandoverKind,
  draft: HandoverSessionDraftPayload,
  context?: { pickupOdometerKm?: number | null },
): HandoverDraftStepValidationIssue[] {
  const issues: HandoverDraftStepValidationIssue[] = [];
  const { form } = draft;

  switch (step) {
    case 'vehicle': {
      if (!form.actualStationId?.trim()) {
        issues.push({ step, field: 'actualStationId', message: 'Station ist erforderlich' });
      }
      const odo = Number(form.odometerKm);
      if (!form.odometerKm?.trim() || !Number.isFinite(odo) || odo < 0) {
        issues.push({ step, field: 'odometerKm', message: 'Kilometerstand ist erforderlich' });
      }
      if (kind === 'RETURN' && context?.pickupOdometerKm != null && odo < context.pickupOdometerKm) {
        issues.push({
          step,
          field: 'odometerKm',
          message: 'Rückgabe-Kilometerstand darf nicht unter Pickup liegen',
        });
      }
      break;
    }
    case 'condition': {
      if (!Number.isFinite(form.fuelPercent) || form.fuelPercent < 0 || form.fuelPercent > 100) {
        issues.push({ step, field: 'fuelPercent', message: 'Tankstand 0–100 %' });
      }
      break;
    }
    case 'documents': {
      if (!form.checks.documentsAcknowledged) {
        issues.push({
          step,
          field: 'documentsAcknowledged',
          message: 'Dokumente müssen bestätigt werden',
        });
      }
      break;
    }
    case 'signatures': {
      if (!draft.signatureStatus.customer.captured && !draft.signatureStatus.customer.name?.trim()) {
        issues.push({ step, field: 'customerSignature', message: 'Kundenunterschrift fehlt' });
      }
      if (!draft.signatureStatus.staff.captured && !draft.signatureStatus.staff.name?.trim()) {
        issues.push({ step, field: 'staffSignature', message: 'Mitarbeiterunterschrift fehlt' });
      }
      break;
    }
    case 'review':
    case 'damages':
      break;
    default:
      break;
  }

  return issues;
}

export function assertHandoverDraftStepValid(
  step: HandoverDraftStepId,
  kind: HandoverKind,
  draft: HandoverSessionDraftPayload,
  context?: { pickupOdometerKm?: number | null },
): void {
  const issues = validateHandoverDraftStep(step, kind, draft, context);
  if (issues.length > 0) {
    throw new BadRequestException({
      code: 'HANDOVER_DRAFT_STEP_INVALID',
      message: issues[0]!.message,
      issues,
    });
  }
}

export function deriveDraftSessionStatus(
  draft: HandoverSessionDraftPayload,
): 'DRAFT' | 'IN_PROGRESS' | 'AWAITING_SIGNATURE' | 'AWAITING_REQUIREMENTS' {
  if (!draft.form.checks.documentsAcknowledged) {
    return 'IN_PROGRESS';
  }
  const sigOk =
    (draft.signatureStatus.customer.captured || Boolean(draft.signatureStatus.customer.name?.trim())) &&
    (draft.signatureStatus.staff.captured || Boolean(draft.signatureStatus.staff.name?.trim()));
  if (!sigOk) {
    return 'AWAITING_SIGNATURE';
  }
  return 'IN_PROGRESS';
}
