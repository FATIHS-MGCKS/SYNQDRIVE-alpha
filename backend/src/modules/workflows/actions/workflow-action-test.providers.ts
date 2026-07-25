import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { WhatsAppConsentService } from '@modules/whatsapp/whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { WhatsAppTemplateService } from '@modules/whatsapp/whatsapp-template.service';

/** Minimal email adapter mocks for workflow action unit tests. */
export const workflowEmailTestProviders = [
  { provide: GeneratedDocumentsService, useValue: { getById: jest.fn() } },
  { provide: DOCUMENTS_STORAGE, useValue: { getObject: jest.fn() } },
  {
    provide: OutboundEmailPolicyService,
    useValue: {
      resolveIdentity: jest.fn().mockResolvedValue({
        fromEmail: 'noreply@test.eu',
        fromName: 'Test',
        replyToEmail: 'support@test.eu',
      }),
      isValidEmail: (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
      validateRecipientEmails: jest.fn(),
    },
  },
  { provide: OutboundEmailService, useValue: { recordEvent: jest.fn() } },
  {
    provide: EmailProviderRegistry,
    useValue: {
      resolve: () => ({
        sendEmail: jest.fn().mockResolvedValue({
          provider: 'dev',
          providerMessageId: 'msg-1',
          status: 'SENT_SIMULATED',
        }),
      }),
    },
  },
];

/** Minimal WhatsApp adapter mocks for workflow action unit tests. */
export const workflowWhatsAppTestProviders = [
  {
    provide: WhatsAppTemplateService,
    useValue: {
      sendTemplateMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'wamid.test',
        status: 'SENT',
      }),
    },
  },
  {
    provide: WhatsAppProviderService,
    useValue: {
      isConfigured: jest.fn().mockReturnValue(true),
      sendTextMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'wamid.text.test',
        status: 'SENT',
      }),
    },
  },
  {
    provide: WhatsAppConsentService,
    useValue: {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
      getConsent: jest.fn().mockResolvedValue({
        optedInAt: new Date(),
        optedOutAt: null,
        marketingAllowed: false,
        transactionalAllowed: true,
      }),
      isOptedOut: jest.fn().mockReturnValue(false),
    },
  },
  { provide: WhatsAppMessagePolicyService, useClass: WhatsAppMessagePolicyService },
];

export const workflowActionAdapterTestProviders = [
  ...workflowEmailTestProviders,
  ...workflowWhatsAppTestProviders,
];
