import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppAiMode } from '@prisma/client';

describe('WhatsAppMessagePolicyService', () => {
  const service = new WhatsAppMessagePolicyService();

  const baseConfig = {
    isActive: true,
    aiMode: WhatsAppAiMode.FULL,
    serviceWindowOpen: false,
  } as any;

  it('blocks free text outside service window', () => {
    const result = service.canSendFreeText('org-1', baseConfig, {
      customerId: 'c-1',
      lastCustomerMessageAt: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('service window');
  });

  it('blocks auto-reply when AI is OFF', () => {
    const result = service.canAutoReply(
      { ...baseConfig, aiMode: WhatsAppAiMode.OFF },
      { customerId: 'c-1', status: 'OPEN' },
      {},
    );
    expect(result.allowed).toBe(false);
  });

  it('requires human approval for sensitive payment intent', () => {
    const result = service.requiresHumanApproval({
      intent: 'payment',
      sensitiveFlags: ['PAYMENT_PROBLEM'],
    });
    expect(result.required).toBe(true);
  });

  it('blocks auto-reply for unknown customer in FULL mode', () => {
    const result = service.canAutoReply(
      baseConfig,
      { customerId: null, status: 'PENDING_HUMAN' },
      { sensitiveFlags: ['UNKNOWN_CUSTOMER'] },
    );
    expect(result.allowed).toBe(false);
  });
});
