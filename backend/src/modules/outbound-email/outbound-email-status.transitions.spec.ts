import {
  OutboundEmailDeliveryStatus,
  OutboundEmailEventType,
  OutboundEmailStatus,
} from '@prisma/client';
import {
  buildProviderAcceptedPatch,
  buildProviderFailurePatch,
  buildProviderResultPatch,
  canTransitionOutboundDeliveryStatus,
  canTransitionOutboundSendStatus,
  deriveOutboundCommunicationPhase,
  OutboundCommunicationPhase,
  OutboundEmailStatusTransitionError,
  resolveWebhookStatusPatch,
} from './outbound-email-status.transitions';

describe('outbound-email-status.transitions', () => {
  describe('deriveOutboundCommunicationPhase', () => {
    it('maps queue and preparing states', () => {
      expect(
        deriveOutboundCommunicationPhase({
          status: OutboundEmailStatus.QUEUED,
          deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
        }),
      ).toBe(OutboundCommunicationPhase.QUEUED);

      expect(
        deriveOutboundCommunicationPhase({
          status: OutboundEmailStatus.SENDING,
          deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
        }),
      ).toBe(OutboundCommunicationPhase.PREPARING);
    });

    it('maps provider acceptance before delivery', () => {
      expect(
        deriveOutboundCommunicationPhase({
          status: OutboundEmailStatus.SENT,
          deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
        }),
      ).toBe(OutboundCommunicationPhase.PROVIDER_ACCEPTED);
    });

    it('maps delivered and bounced', () => {
      expect(
        deriveOutboundCommunicationPhase({
          status: OutboundEmailStatus.SENT,
          deliveryStatus: OutboundEmailDeliveryStatus.DELIVERED,
        }),
      ).toBe(OutboundCommunicationPhase.DELIVERED);

      expect(
        deriveOutboundCommunicationPhase({
          status: OutboundEmailStatus.FAILED,
          deliveryStatus: OutboundEmailDeliveryStatus.BOUNCED,
        }),
      ).toBe(OutboundCommunicationPhase.BOUNCED);
    });
  });

  describe('send status transitions', () => {
    it('allows QUEUED → SENDING → SENT', () => {
      expect(
        canTransitionOutboundSendStatus(
          OutboundEmailStatus.QUEUED,
          OutboundEmailStatus.SENDING,
        ),
      ).toBe(true);
      expect(
        canTransitionOutboundSendStatus(
          OutboundEmailStatus.SENDING,
          OutboundEmailStatus.SENT,
        ),
      ).toBe(true);
    });

    it('rejects QUEUED → SENT (skip preparing)', () => {
      expect(
        canTransitionOutboundSendStatus(
          OutboundEmailStatus.QUEUED,
          OutboundEmailStatus.SENT,
        ),
      ).toBe(false);
    });

    it('allows bounce after sent (SENT → FAILED)', () => {
      expect(
        canTransitionOutboundSendStatus(
          OutboundEmailStatus.SENT,
          OutboundEmailStatus.FAILED,
        ),
      ).toBe(true);
    });
  });

  describe('delivery status transitions', () => {
    it('allows PENDING → ACCEPTED → DELIVERED', () => {
      expect(
        canTransitionOutboundDeliveryStatus(
          OutboundEmailDeliveryStatus.PENDING,
          OutboundEmailDeliveryStatus.ACCEPTED,
        ),
      ).toBe(true);
      expect(
        canTransitionOutboundDeliveryStatus(
          OutboundEmailDeliveryStatus.ACCEPTED,
          OutboundEmailDeliveryStatus.DELIVERED,
        ),
      ).toBe(true);
    });

    it('allows bounce after delivery', () => {
      expect(
        canTransitionOutboundDeliveryStatus(
          OutboundEmailDeliveryStatus.DELIVERED,
          OutboundEmailDeliveryStatus.BOUNCED,
        ),
      ).toBe(true);
    });

    it('rejects DELIVERED → PENDING', () => {
      expect(
        canTransitionOutboundDeliveryStatus(
          OutboundEmailDeliveryStatus.DELIVERED,
          OutboundEmailDeliveryStatus.PENDING,
        ),
      ).toBe(false);
    });
  });

  describe('buildProviderAcceptedPatch', () => {
    it('sets sentAt only together with acceptedAt', () => {
      const acceptedAt = new Date('2026-07-14T10:00:00.000Z');
      const patch = buildProviderAcceptedPatch({
        provider: 'resend',
        providerMessageId: 'em_1',
        simulated: false,
        acceptedAt,
      });
      expect(patch.acceptedAt).toEqual(acceptedAt);
      expect(patch.sentAt).toEqual(acceptedAt);
      expect(patch.deliveryStatus).toBe(OutboundEmailDeliveryStatus.ACCEPTED);
    });
  });

  describe('buildProviderResultPatch', () => {
    it('rejects setting sentAt without acceptance on invalid patch', () => {
      expect(() =>
        resolveWebhookStatusPatch(
          OutboundEmailEventType.DELIVERED,
          {
            status: OutboundEmailStatus.SENT,
            deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
            acceptedAt: null,
            sentAt: null,
          },
          {},
        ),
      ).not.toThrow();
    });

    it('maps provider failure from SENDING', () => {
      const patch = buildProviderResultPatch(
        {
          status: OutboundEmailStatus.SENDING,
          deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
        },
        {
          status: 'FAILED',
          provider: 'resend',
          providerMessageId: null,
          errorMessage: 'Rejected',
        },
      );
      expect(patch.status).toBe(OutboundEmailStatus.FAILED);
      expect(patch.deliveryStatus).toBe(OutboundEmailDeliveryStatus.FAILED);
    });
  });

  describe('resolveWebhookStatusPatch', () => {
    it('delivered webhook does not overwrite sentAt when already accepted', () => {
      const acceptedAt = new Date('2026-07-14T10:00:00.000Z');
      const patch = resolveWebhookStatusPatch(
        OutboundEmailEventType.DELIVERED,
        {
          status: OutboundEmailStatus.SENT,
          deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
          acceptedAt,
          sentAt: acceptedAt,
        },
      );
      expect(patch?.deliveryStatus).toBe(OutboundEmailDeliveryStatus.DELIVERED);
      expect(patch?.sentAt).toBeUndefined();
      expect(patch?.deliveredAt).toBeInstanceOf(Date);
    });

    it('bounce after sent keeps audit transition valid', () => {
      const patch = resolveWebhookStatusPatch(
        OutboundEmailEventType.BOUNCED,
        {
          status: OutboundEmailStatus.SENT,
          deliveryStatus: OutboundEmailDeliveryStatus.DELIVERED,
          acceptedAt: new Date(),
          sentAt: new Date(),
        },
        { bounce: { message: 'Hard bounce' } },
      );
      expect(patch?.status).toBe(OutboundEmailStatus.FAILED);
      expect(patch?.deliveryStatus).toBe(OutboundEmailDeliveryStatus.BOUNCED);
      expect(patch?.errorMessage).toBe('Hard bounce');
    });

    it('throws on illegal delivery rollback', () => {
      expect(() =>
        resolveWebhookStatusPatch(
          OutboundEmailEventType.FAILED,
          {
            status: OutboundEmailStatus.FAILED,
            deliveryStatus: OutboundEmailDeliveryStatus.BOUNCED,
          },
          {},
        ),
      ).toThrow(OutboundEmailStatusTransitionError);
    });
  });

  describe('buildProviderFailurePatch', () => {
    it('sanitizes error messages', () => {
      const patch = buildProviderFailurePatch(
        'PROVIDER_ERROR',
        'Token re_abcdefghijklmnop rejected',
      );
      expect(patch.errorMessage).toContain('[redacted]');
    });
  });
});
