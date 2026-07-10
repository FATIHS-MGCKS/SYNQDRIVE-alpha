import { Module } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { OrgEmailController } from './org-email.controller';
import { BookingDocumentsEmailController } from './booking-documents-email.controller';
import { ResendWebhookController } from './resend-webhook.controller';
import { ResendWebhookService } from './resend-webhook.service';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailDomainService } from './outbound-email-domain.service';
import { OutboundEmailService } from './outbound-email.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { DevEmailProvider } from './providers/dev-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { EmailProviderRegistry } from './providers/email-provider.registry';

@Module({
  imports: [DocumentsModule, ActivityLogModule],
  controllers: [OrgEmailController, BookingDocumentsEmailController, ResendWebhookController],
  providers: [
    OutboundEmailPolicyService,
    OutboundEmailDomainService,
    OutboundEmailService,
    BookingDocumentEmailService,
    DevEmailProvider,
    ResendEmailProvider,
    EmailProviderRegistry,
    ResendWebhookService,
  ],
  exports: [
    OutboundEmailPolicyService,
    OutboundEmailDomainService,
    OutboundEmailService,
    BookingDocumentEmailService,
    EmailProviderRegistry,
  ],
})
export class OutboundEmailModule {}
