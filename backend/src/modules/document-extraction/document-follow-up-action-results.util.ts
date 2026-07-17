import type { DocumentActionPlanExecution } from './document-action.types';
import { readDocumentActionPlanState } from './document-action-plan.store';

export type DocumentFollowUpActionResultIds = {
  fineId: string | null;
  invoiceId: string | null;
  damageId: string | null;
  serviceEventId: string | null;
  tireMeasurementId: string | null;
};

function readSucceededAction(
  execution: DocumentActionPlanExecution | null | undefined,
  semanticAction: string,
) {
  return execution?.actions.find(
    (row) => row.semanticAction === semanticAction && row.status === 'SUCCEEDED',
  );
}

/** Resolves apply action result entity IDs from pipeline execution (post-apply). */
export function resolveDocumentFollowUpActionResultIds(
  plausibility: unknown,
): DocumentFollowUpActionResultIds {
  const { actionPlanExecution } = readDocumentActionPlanState(plausibility);
  const execution = actionPlanExecution ?? null;

  const fineAction = readSucceededAction(execution, 'CREATE_FINE_DRAFT');
  const invoiceAction =
    readSucceededAction(execution, 'CREATE_INVOICE_DRAFT') ??
    readSucceededAction(execution, 'CREATE_CREDIT_NOTE_DRAFT');
  const serviceEventAction =
    readSucceededAction(execution, 'CREATE_SERVICE_EVENT') ??
    readSucceededAction(execution, 'CREATE_COMPLIANCE_SERVICE_EVENT');
  const damageRecordAction = readSucceededAction(execution, 'CREATE_DAMAGE_RECORD');
  const damageDraftAction = readSucceededAction(execution, 'CREATE_DAMAGE_DRAFT');
  const linkDamageAction = readSucceededAction(execution, 'LINK_EXISTING_DAMAGE');
  const tireAction = readSucceededAction(execution, 'APPLY_TIRE_MEASUREMENT');
  const brakeAction = readSucceededAction(execution, 'APPLY_BRAKE_MEASUREMENT');
  const batteryAction = readSucceededAction(execution, 'APPLY_BATTERY_MEASUREMENT');

  const serviceEventId =
    serviceEventAction?.resultEntityId ??
    (serviceEventAction?.output?.serviceEventId as string | undefined) ??
    brakeAction?.resultEntityId ??
    (brakeAction?.output?.serviceEventId as string | undefined) ??
    (batteryAction?.output?.serviceEventId as string | undefined) ??
    null;

  const damageId =
    damageRecordAction?.resultEntityId ??
    (damageRecordAction?.output?.damageId as string | undefined) ??
    linkDamageAction?.resultEntityId ??
    (linkDamageAction?.output?.damageId as string | undefined) ??
    damageDraftAction?.resultEntityId ??
    (damageDraftAction?.output?.damageId as string | undefined) ??
    null;

  return {
    fineId:
      fineAction?.resultEntityId ?? (fineAction?.output?.fineId as string | undefined) ?? null,
    invoiceId:
      invoiceAction?.resultEntityId ??
      (invoiceAction?.output?.invoiceId as string | undefined) ??
      null,
    damageId,
    serviceEventId,
    tireMeasurementId:
      tireAction?.resultEntityId ??
      (tireAction?.output?.tireMeasurementId as string | undefined) ??
      null,
  };
}
