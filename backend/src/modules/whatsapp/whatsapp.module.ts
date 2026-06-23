import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import whatsappConfig from '@config/whatsapp.config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppConversationMatcherService } from './whatsapp-conversation-matcher.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppAiRouterService } from './whatsapp-ai-router.service';
import { WhatsAppAiContextService } from './whatsapp-ai-context.service';
import { WhatsAppAiToolsService } from './whatsapp-ai-tools.service';
import { WhatsAppQuickActionsService } from './whatsapp-quick-actions.service';
import { WhatsAppConversationContextService } from './whatsapp-conversation-context.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { WhatsAppAutomationHooksService } from './whatsapp-automation-hooks.service';
import { MetaWhatsAppCloudProvider } from './providers/meta-whatsapp-cloud.provider';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';

@Module({
  imports: [
    ConfigModule.forFeature(whatsappConfig),
    ActivityLogModule,
    BookingsModule,
    DocumentsModule,
    VehiclesModule,
    forwardRef(() => VehicleIntelligenceModule),
    TasksModule,
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppWebhookService,
    WhatsAppConsentService,
    WhatsAppMessagePolicyService,
    WhatsAppConversationMatcherService,
    WhatsAppTemplateService,
    WhatsAppAiRouterService,
    WhatsAppAiContextService,
    WhatsAppAiToolsService,
    WhatsAppConversationContextService,
    WhatsAppQuickActionsService,
    WhatsAppBookingReminderService,
    WhatsAppAutomationHooksService,
    MetaWhatsAppCloudProvider,
    WhatsAppProviderService,
  ],
  exports: [
    WhatsAppService,
    WhatsAppProviderService,
    WhatsAppTemplateService,
    WhatsAppAiRouterService,
    WhatsAppBookingReminderService,
    WhatsAppAutomationHooksService,
  ],
})
export class WhatsAppModule {}