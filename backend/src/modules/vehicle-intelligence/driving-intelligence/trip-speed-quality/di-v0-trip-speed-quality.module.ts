import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { resolveDiV0P2AutoProjectionV2Bootstrap } from './di-v0-p2-auto-projection-v2.config';
import { DiV0P2AutoProjectionV2Scheduler } from './di-v0-p2-auto-projection-v2.scheduler';
import { DiV0P2AutoProjectionV2Service } from './di-v0-p2-auto-projection-v2.service';
import {
  DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP,
  DI_V0_P2_AUTO_PROJECTION_V2_CONFIG,
} from './di-v0-p2-auto-projection-v2.tokens';
import { DiV0TripSpeedQualityProjectionService } from './di-v0-trip-speed-quality-projection.service';

/**
 * P2 trip speed quality projection. Auto V2 follow-up is OFF unless DI_V0_P2_AUTO_PROJECTION_V2_* env is set.
 * S4C T06 completion path remains unchanged (no direct P2 import in s4c-executor).
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule],
  providers: [
    DiV0TripSpeedQualityProjectionService,
    {
      provide: DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP,
      useFactory: () => resolveDiV0P2AutoProjectionV2Bootstrap(),
    },
    {
      provide: DI_V0_P2_AUTO_PROJECTION_V2_CONFIG,
      useFactory: () => resolveDiV0P2AutoProjectionV2Bootstrap().config,
    },
    DiV0P2AutoProjectionV2Service,
    DiV0P2AutoProjectionV2Scheduler,
  ],
  exports: [DiV0TripSpeedQualityProjectionService, DiV0P2AutoProjectionV2Service],
})
export class DiV0TripSpeedQualityModule {}
