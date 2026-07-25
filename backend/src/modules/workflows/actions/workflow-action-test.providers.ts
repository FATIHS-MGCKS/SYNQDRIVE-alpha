import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { WhatsAppConsentService } from '@modules/whatsapp/whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { WhatsAppTemplateService } from '@modules/whatsapp/whatsapp-template.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { SmsMessagingService } from '@modules/sms/sms-messaging.service';
import { OutboundSmsService } from '@modules/sms/outbound-sms.service';
import { VoiceCallOrchestrationService } from '@modules/voice-call-orchestration/voice-call-orchestration.service';

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

export const workflowSmsTestProviders = [
  {
    provide: SmsMessagingService,
    useValue: {
      isSimulateEnabled: jest.fn().mockReturnValue(true),
      isConfiguredForOrganization: jest.fn().mockResolvedValue(true),
      resolveSender: jest.fn().mockResolvedValue({
        messagingServiceSid: 'MG_TEST',
        fromSenderRef: 'MG:MG_TEST',
        fromMasked: '+49***0000',
      }),
      sendSms: jest.fn().mockResolvedValue({
        providerMessageSid: 'SM_TEST_1',
        status: 'SENT_SIMULATED',
        segmentCount: 1,
      }),
    },
  },
  {
    provide: SmsConsentService,
    useValue: {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
      getConsent: jest.fn().mockResolvedValue({
        optedInAt: new Date(),
        optedOutAt: null,
        marketingAllowed: false,
        transactionalAllowed: true,
      }),
    },
  },
  { provide: OutboundSmsService, useValue: { recordEvent: jest.fn().mockResolvedValue({}) } },
];

export const workflowVoiceTestProviders = [
  {
    provide: VoiceCallOrchestrationService,
    useValue: {
      orchestrateOutboundCall: jest.fn().mockResolvedValue({
        conversationId: 'conv-test-1',
        maskedConversationRef: 'conv_***',
        maskedCallRef: 'CA_***',
        status: 'started',
        dryRun: false,
        idempotentReplay: false,
      }),
    },
  },
];

export const workflowActionAdapterTestProviders = [
  ...workflowEmailTestProviders,
  ...workflowWhatsAppTestProviders,
  ...workflowSmsTestProviders,
  ...workflowVoiceTestProviders,
];
