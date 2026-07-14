import { ActivityAction, ActivityEntity } from '@prisma/client';
import type { ActivityLogService } from '@modules/activity-log/activity-log.service';
import {
  communicationPhaseLabel,
  deriveOutboundCommunicationPhase,
  type OutboundCommunicationPhase,
} from '@modules/outbound-email/outbound-email-status.transitions';
import {
  shouldPromoteInvoiceToSentOnEmailSuccess,
  shouldRevertInvoiceSentOnEmailBounce,
  shouldUpdateInvoiceOnEmailDelivery,
} from './invoice-status.transitions';

export interface InvoiceOutboundStatusChangeInput {
  organizationId: string;
  invoiceId: string;
  outboundEmailId: string;
  userId?: string | null;
  previous: { status: string; deliveryStatus: string };
  next: { status: string; deliveryStatus: string };
  documentId?: string | null;
  provider?: string | null;
}

export function derivePhaseChange(
  previous: { status: string; deliveryStatus: string },
  next: { status: string; deliveryStatus: string },
): { from: OutboundCommunicationPhase; to: OutboundCommunicationPhase } {
  return {
    from: deriveOutboundCommunicationPhase(previous),
    to: deriveOutboundCommunicationPhase(next),
  };
}

/**
 * Logs invoice communication status changes without mutating OrgInvoice business status.
 */
export async function logInvoiceCommunicationStatusChange(
  activityLog: ActivityLogService,
  input: InvoiceOutboundStatusChangeInput,
): Promise<void> {
  const { from, to } = derivePhaseChange(input.previous, input.next);
  if (from === to) return;

  const fromLabel = communicationPhaseLabel(from);
  const toLabel = communicationPhaseLabel(to);

  await activityLog.log({
    organizationId: input.organizationId,
    userId: input.userId ?? undefined,
    action: ActivityAction.UPDATE,
    entity: ActivityEntity.INVOICE,
    entityId: input.invoiceId,
    description: `Rechnungs-E-Mail: ${fromLabel} → ${toLabel}`,
    metaJson: {
      outboundEmailId: input.outboundEmailId,
      communicationPhaseFrom: from,
      communicationPhaseTo: to,
      sendStatusFrom: input.previous.status,
      sendStatusTo: input.next.status,
      deliveryStatusFrom: input.previous.deliveryStatus,
      deliveryStatusTo: input.next.deliveryStatus,
      documentId: input.documentId ?? null,
      provider: input.provider ?? null,
      invoiceStatusUnchanged: true,
      promoteToSentOnEmail: shouldPromoteInvoiceToSentOnEmailSuccess(),
      updateOnDelivery: shouldUpdateInvoiceOnEmailDelivery(),
      revertOnBounce: shouldRevertInvoiceSentOnEmailBounce(),
    },
  });
}
