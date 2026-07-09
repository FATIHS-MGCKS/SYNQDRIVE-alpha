import { Module } from '@nestjs/common';
import { DevEmailProvider } from './providers/dev-email.provider';
import { EmailProviderFactory } from './providers/email-provider.factory';
import { ResendApiClient } from './providers/resend/resend-api.client';
import { ResendDomainAdapter } from './providers/resend/resend-domain.adapter';
import { ResendEmailProvider } from './providers/resend/resend-email.provider';
import { ResendWebhookService } from './providers/resend/resend-webhook.service';
import { OutboundEmailController } from './outbound-email.controller';
import { OutboundEmailWebhookController } from './outbound-email-webhook.controller';
import { EmailProviderBootstrap } from './email-provider.bootstrap';
import { EmailAddressPolicyService } from './services/email-address-policy.service';
import { EmailSendGuardService } from './services/email-send-guard.service';
import { OrgEmailDomainService } from './services/org-email-domain.service';
import { OrgEmailSettingsService } from './services/org-email-settings.service';
import { OutboundEmailService } from './services/outbound-email.service';

@Module({
  controllers: [OutboundEmailController, OutboundEmailWebhookController],
  providers: [
    OrgEmailSettingsService,
    OrgEmailDomainService,
    OutboundEmailService,
    EmailAddressPolicyService,
    EmailSendGuardService,
    DevEmailProvider,
    ResendApiClient,
    ResendEmailProvider,
    ResendDomainAdapter,
    ResendWebhookService,
    EmailProviderFactory,
    EmailProviderBootstrap,
  ],
  exports: [
    OrgEmailSettingsService,
    OrgEmailDomainService,
    OutboundEmailService,
    EmailAddressPolicyService,
    EmailProviderFactory,
  ],
})
export class OutboundEmailModule {}
