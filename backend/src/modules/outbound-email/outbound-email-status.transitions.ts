import {
  OutboundEmailDeliveryStatus,
  OutboundEmailEventType,
  OutboundEmailStatus,
} from '@prisma/client';
import { sanitizeOutboundErrorMessage } from './outbound-email-audit.util';

/**
 * Canonical communication phase for invoice/booking outbound email.
 * Maps from persisted `status` + `deliveryStatus` (backward compatible with SENDING / SENT_SIMULATED).
 */
export enum OutboundCommunicationPhase {
  PREPARING = 'PREPARING',
  QUEUED = 'QUEUED',
  PROVIDER_ACCEPTED = 'PROVIDER_ACCEPTED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED',
}

export class OutboundEmailStatusTransitionError extends Error {
  constructor(
    public readonly axis: 'send' | 'delivery' | 'phase',
    public readonly from: string,
    public readonly to: string,
    message?: string,
  ) {
    super(message ?? `Invalid outbound email ${axis} transition: ${from} → ${to}`);
    this.name = 'OutboundEmailStatusTransitionError';
  }
}

const SEND_TRANSITIONS: Readonly<Record<OutboundEmailStatus, readonly OutboundEmailStatus[]>> = {
  [OutboundEmailStatus.QUEUED]: [OutboundEmailStatus.SENDING, OutboundEmailStatus.FAILED],
  [OutboundEmailStatus.SENDING]: [
    OutboundEmailStatus.SENT,
    OutboundEmailStatus.SENT_SIMULATED,
    OutboundEmailStatus.FAILED,
  ],
  [OutboundEmailStatus.SENT]: [OutboundEmailStatus.FAILED],
  [OutboundEmailStatus.SENT_SIMULATED]: [OutboundEmailStatus.FAILED],
  [OutboundEmailStatus.FAILED]: [],
};

const DELIVERY_TRANSITIONS: Readonly<
  Record<OutboundEmailDeliveryStatus, readonly OutboundEmailDeliveryStatus[]>
> = {
  [OutboundEmailDeliveryStatus.PENDING]: [
    OutboundEmailDeliveryStatus.ACCEPTED,
    OutboundEmailDeliveryStatus.FAILED,
  ],
  [OutboundEmailDeliveryStatus.ACCEPTED]: [
    OutboundEmailDeliveryStatus.DELIVERED,
    OutboundEmailDeliveryStatus.BOUNCED,
    OutboundEmailDeliveryStatus.COMPLAINED,
    OutboundEmailDeliveryStatus.FAILED,
  ],
  [OutboundEmailDeliveryStatus.DELIVERED]: [
    OutboundEmailDeliveryStatus.BOUNCED,
    OutboundEmailDeliveryStatus.COMPLAINED,
    OutboundEmailDeliveryStatus.FAILED,
  ],
  [OutboundEmailDeliveryStatus.BOUNCED]: [],
  [OutboundEmailDeliveryStatus.COMPLAINED]: [],
  [OutboundEmailDeliveryStatus.FAILED]: [],
};

export type OutboundEmailStatusPatch = {
  status?: OutboundEmailStatus;
  deliveryStatus?: OutboundEmailDeliveryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  acceptedAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date | null;
  provider?: string | null;
  providerMessageId?: string | null;
};

export function deriveOutboundCommunicationPhase(input: {
  status: OutboundEmailStatus | string;
  deliveryStatus: OutboundEmailDeliveryStatus | string;
}): OutboundCommunicationPhase {
  const delivery = input.deliveryStatus as OutboundEmailDeliveryStatus;
  const send = input.status as OutboundEmailStatus;

  if (delivery === OutboundEmailDeliveryStatus.BOUNCED) {
    return OutboundCommunicationPhase.BOUNCED;
  }
  if (delivery === OutboundEmailDeliveryStatus.COMPLAINED) {
    return OutboundCommunicationPhase.FAILED;
  }
  if (
    send === OutboundEmailStatus.FAILED
    && delivery === OutboundEmailDeliveryStatus.FAILED
  ) {
    return OutboundCommunicationPhase.FAILED;
  }
  if (delivery === OutboundEmailDeliveryStatus.DELIVERED) {
    return OutboundCommunicationPhase.DELIVERED;
  }
  if (
    (send === OutboundEmailStatus.SENT || send === OutboundEmailStatus.SENT_SIMULATED)
    && delivery === OutboundEmailDeliveryStatus.ACCEPTED
  ) {
    return OutboundCommunicationPhase.PROVIDER_ACCEPTED;
  }
  if (send === OutboundEmailStatus.SENDING) {
    return OutboundCommunicationPhase.PREPARING;
  }
  if (send === OutboundEmailStatus.QUEUED) {
    return OutboundCommunicationPhase.QUEUED;
  }
  if (send === OutboundEmailStatus.FAILED) {
    return OutboundCommunicationPhase.FAILED;
  }
  if (send === OutboundEmailStatus.SENT || send === OutboundEmailStatus.SENT_SIMULATED) {
    return OutboundCommunicationPhase.SENT;
  }
  return OutboundCommunicationPhase.QUEUED;
}

export function canTransitionOutboundSendStatus(
  from: OutboundEmailStatus,
  to: OutboundEmailStatus,
): boolean {
  return (SEND_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionOutboundDeliveryStatus(
  from: OutboundEmailDeliveryStatus,
  to: OutboundEmailDeliveryStatus,
): boolean {
  return (DELIVERY_TRANSITIONS[from] ?? []).includes(to);
}

export function assertOutboundSendStatusTransition(
  from: OutboundEmailStatus,
  to: OutboundEmailStatus,
): void {
  if (!canTransitionOutboundSendStatus(from, to)) {
    throw new OutboundEmailStatusTransitionError('send', from, to);
  }
}

export function assertOutboundDeliveryStatusTransition(
  from: OutboundEmailDeliveryStatus,
  to: OutboundEmailDeliveryStatus,
): void {
  if (!canTransitionOutboundDeliveryStatus(from, to)) {
    throw new OutboundEmailStatusTransitionError('delivery', from, to);
  }
}

function applyPatchWithTransitionGuards(
  current: {
    status: OutboundEmailStatus;
    deliveryStatus: OutboundEmailDeliveryStatus;
    acceptedAt?: Date | null;
    sentAt?: Date | null;
  },
  patch: OutboundEmailStatusPatch,
): OutboundEmailStatusPatch {
  const nextStatus = patch.status ?? current.status;
  const nextDelivery = patch.deliveryStatus ?? current.deliveryStatus;

  if (nextStatus !== current.status) {
    assertOutboundSendStatusTransition(current.status, nextStatus);
  }
  if (nextDelivery !== current.deliveryStatus) {
    assertOutboundDeliveryStatusTransition(current.deliveryStatus, nextDelivery);
  }

  const result = { ...patch };

  if (result.sentAt && !result.acceptedAt && !current.acceptedAt) {
    throw new OutboundEmailStatusTransitionError(
      'phase',
      deriveOutboundCommunicationPhase(current),
      'SENT',
      'sentAt cannot be set before provider acceptance (acceptedAt)',
    );
  }

  if (
    nextDelivery === OutboundEmailDeliveryStatus.ACCEPTED
    && result.acceptedAt
    && !result.sentAt
    && !current.sentAt
  ) {
    result.sentAt = result.acceptedAt;
  }

  return result;
}

export function buildPreparingPatch(): OutboundEmailStatusPatch {
  return { status: OutboundEmailStatus.SENDING };
}

export function buildProviderFailurePatch(
  errorCode: string,
  errorMessage: string | null | undefined,
  failedAt: Date = new Date(),
): OutboundEmailStatusPatch {
  return {
    status: OutboundEmailStatus.FAILED,
    deliveryStatus: OutboundEmailDeliveryStatus.FAILED,
    errorCode,
    errorMessage: sanitizeOutboundErrorMessage(errorMessage),
    failedAt,
  };
}

export function buildProviderAcceptedPatch(input: {
  provider: string;
  providerMessageId: string | null;
  simulated: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  acceptedAt?: Date;
}): OutboundEmailStatusPatch {
  const acceptedAt = input.acceptedAt ?? new Date();
  return {
    status: input.simulated
      ? OutboundEmailStatus.SENT_SIMULATED
      : OutboundEmailStatus.SENT,
    deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    errorCode: input.errorCode ?? null,
    errorMessage: sanitizeOutboundErrorMessage(input.errorMessage),
    acceptedAt,
    sentAt: acceptedAt,
    failedAt: null,
  };
}

export function buildProviderResultPatch(
  current: {
    status: OutboundEmailStatus;
    deliveryStatus: OutboundEmailDeliveryStatus;
  },
  result: {
    status: 'SENT' | 'SENT_SIMULATED' | 'FAILED';
    provider: string;
    providerMessageId: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): OutboundEmailStatusPatch {
  if (result.status === 'FAILED') {
    return applyPatchWithTransitionGuards(current, {
      ...buildProviderFailurePatch(
        result.errorCode ?? 'PROVIDER_FAILED',
        result.errorMessage,
      ),
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    });
  }
  return applyPatchWithTransitionGuards(
    current,
    buildProviderAcceptedPatch({
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      simulated: result.status === 'SENT_SIMULATED',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    }),
  );
}

export function resolveWebhookStatusPatch(
  eventType: OutboundEmailEventType,
  current: {
    status: OutboundEmailStatus;
    deliveryStatus: OutboundEmailDeliveryStatus;
    acceptedAt?: Date | null;
    sentAt?: Date | null;
  },
  payload?: Record<string, unknown>,
): OutboundEmailStatusPatch | null {
  const now = new Date();
  let patch: OutboundEmailStatusPatch | null = null;

  switch (eventType) {
    case OutboundEmailEventType.BOUNCED:
      patch = {
        status: OutboundEmailStatus.FAILED,
        deliveryStatus: OutboundEmailDeliveryStatus.BOUNCED,
        errorCode: 'BOUNCED',
        errorMessage: sanitizeOutboundErrorMessage(
          extractWebhookErrorMessage(payload) ?? 'Email bounced',
        ),
        failedAt: now,
      };
      break;
    case OutboundEmailEventType.COMPLAINED:
      patch = {
        status: OutboundEmailStatus.FAILED,
        deliveryStatus: OutboundEmailDeliveryStatus.COMPLAINED,
        errorCode: 'COMPLAINED',
        errorMessage: 'Recipient marked email as spam',
        failedAt: now,
      };
      break;
    case OutboundEmailEventType.DELIVERED:
      patch = {
        deliveryStatus: OutboundEmailDeliveryStatus.DELIVERED,
        deliveredAt: now,
      };
      if (
        current.status === OutboundEmailStatus.SENDING
        && !current.acceptedAt
      ) {
        patch.status = OutboundEmailStatus.SENT;
        patch.acceptedAt = now;
        patch.sentAt = now;
      } else if (current.acceptedAt && !current.sentAt) {
        patch.sentAt = current.acceptedAt;
      }
      break;
    case OutboundEmailEventType.FAILED:
      patch = buildProviderFailurePatch(
        'PROVIDER_FAILED',
        extractWebhookErrorMessage(payload) ?? 'Email delivery failed',
        now,
      );
      break;
    default:
      return null;
  }

  if (!patch) return null;
  return applyPatchWithTransitionGuards(current, patch);
}

function extractWebhookErrorMessage(payload?: Record<string, unknown>): string | null {
  if (!payload) return null;
  const bounce = payload.bounce as { message?: string } | undefined;
  if (bounce?.message?.trim()) return bounce.message.trim();
  const message = payload.message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

export function communicationPhaseLabel(phase: OutboundCommunicationPhase): string {
  switch (phase) {
    case OutboundCommunicationPhase.PREPARING:
      return 'Wird vorbereitet';
    case OutboundCommunicationPhase.QUEUED:
      return 'In Warteschlange';
    case OutboundCommunicationPhase.PROVIDER_ACCEPTED:
      return 'Vom Provider angenommen';
    case OutboundCommunicationPhase.SENT:
      return 'Versendet';
    case OutboundCommunicationPhase.DELIVERED:
      return 'Zugestellt';
    case OutboundCommunicationPhase.FAILED:
      return 'Fehlgeschlagen';
    case OutboundCommunicationPhase.BOUNCED:
      return 'Zurückgewiesen (Bounce)';
    default:
      return phase;
  }
}
