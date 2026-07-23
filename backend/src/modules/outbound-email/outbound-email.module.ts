import { Module, forwardRef } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { OrgEmailController } from './org-email.controller';
import { PlatformEmailController } from './platform-email.controller';
import { BookingDocumentsEmailController } from './booking-documents-email.controller';
import { ResendWebhookController } from './resend-webhook.controller';
import { ResendWebhookService } from './resend-webhook.service';
import { PlatformEmailSettingsService } from './platform-email-settings.service';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailDomainService } from './outbound-email-domain.service';
import { OutboundEmailService } from './outbound-email.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { BookingLegalDocumentEmailService } from './booking-legal-document-email.service';
import { InvoiceDocumentEmailService } from './invoice-document-email.service';
import { DevEmailProvider } from './providers/dev-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { EmailProviderRegistry } from './providers/email-provider.registry';

@Module({
  imports: [forwardRef(() => DocumentsModule), ActivityLogModule],
  controllers: [OrgEmailController, PlatformEmailController, BookingDocumentsEmailController, ResendWebhookController],
  providers: [
    PlatformEmailSettingsService,
    OutboundEmailPolicyService,
    OutboundEmailDomainService,
    OutboundEmailService,
    BookingDocumentEmailService,
    BookingLegalDocumentEmailService,
    InvoiceDocumentEmailService,
    DevEmailProvider,
    ResendEmailProvider,
    EmailProviderRegistry,
    ResendWebhookService,
  ],
  exports: [
    PlatformEmailSettingsService,
    OutboundEmailPolicyService,
    OutboundEmailDomainService,
    OutboundEmailService,
    BookingDocumentEmailService,
    BookingLegalDocumentEmailService,
    InvoiceDocumentEmailService,
    EmailProviderRegistry,
  ],
})
export class OutboundEmailModule {}
