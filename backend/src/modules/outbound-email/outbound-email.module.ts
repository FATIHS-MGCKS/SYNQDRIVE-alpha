import { Module } from '@nestjs/common';
import { DevEmailProvider } from './providers/dev-email.provider';
import { EmailProviderFactory } from './providers/email-provider.factory';
import { OutboundEmailController } from './outbound-email.controller';
import { EmailAddressPolicyService } from './services/email-address-policy.service';
import { OrgEmailDomainService } from './services/org-email-domain.service';
import { OrgEmailSettingsService } from './services/org-email-settings.service';
import { OutboundEmailService } from './services/outbound-email.service';

@Module({
  controllers: [OutboundEmailController],
  providers: [
    OrgEmailSettingsService,
    OrgEmailDomainService,
    OutboundEmailService,
    EmailAddressPolicyService,
    DevEmailProvider,
    EmailProviderFactory,
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
