import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';

@Module({
  imports: [PrismaModule, ObservabilityModule],
  providers: [
    AdaptivePollingShadowRepository,
    AdaptivePollingShadowMetricsService,
    ApdShadowActivationEpochService,
    AdaptivePollingShadowService,
  ],
  exports: [AdaptivePollingShadowService, ApdShadowActivationEpochService],
})
export class AdaptivePollingShadowModule {}
