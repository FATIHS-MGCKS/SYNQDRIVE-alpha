import { Module } from '@nestjs/common';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { PlatformAdminController } from './platform-admin.controller';
import { SecurityGovernanceController } from './security-governance.controller';
import { SecurityGovernanceService } from './security-governance.service';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import {
  PlatformConnectivitySummaryService,
  PlatformDashboardService,
  PlatformResilienceStatusService,
} from './platform-dashboard.service';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import { PlatformOpsInfrastructureService } from './platform-ops-infrastructure.service';
import { PlatformOpsService } from './platform-ops.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { HealthModule } from '../health/health.module';
import { BillingModule } from '../billing/billing.module';
import { SupportModule } from '../support/support.module';
import { OutboundEmailModule } from '../outbound-email/outbound-email.module';
import { VoiceAssistantModule } from '../voice-assistant/voice-assistant.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';
import { PlatformIntegrationsController } from './platform-integrations.controller';
import { PlatformIntegrationsService } from './platform-integrations.service';

@Module({
  imports: [
    DimoModule,
    VehicleIntelligenceModule,
    HealthModule,
    BillingModule,
    SupportModule,
    IamMfaModule,
    OutboundEmailModule,
    VoiceAssistantModule,
    HighMobilityModule,
  ],
  controllers: [PlatformAdminController, SecurityGovernanceController, PlatformIntegrationsController],
  providers: [
    SecurityGovernanceService,
    PlatformIntegrationsService,
    PlatformAdminService,
    VehicleLogbookService,
    PlatformResilienceStatusService,
    PlatformConnectivitySummaryService,
    PlatformDashboardService,
    PlatformOpsService,
    PlatformOpsAlertmanagerService,
    PlatformOpsInfrastructureService,
  ],
  exports: [PlatformAdminService, PlatformDashboardService, PlatformConnectivitySummaryService],
})
export class PlatformAdminModule {}
