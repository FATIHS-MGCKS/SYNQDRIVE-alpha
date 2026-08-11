import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { StationsModule } from '@modules/stations/stations.module';
import { EvaluationsAnalyticsController } from './evaluations-analytics.controller';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';
import { EvaluationsEntityReferenceWriteService } from './evaluations-entity-reference-write.service';

@Module({
  imports: [PrismaModule, StationsModule],
  controllers: [EvaluationsAnalyticsController],
  providers: [
    EvaluationsAnalyticsScopeService,
    EvaluationsAnalyticsService,
    EvaluationsEntityReferenceRepository,
    EvaluationsEntityReferenceWriteService,
  ],
  exports: [
    EvaluationsAnalyticsScopeService,
    EvaluationsAnalyticsService,
    EvaluationsEntityReferenceRepository,
    EvaluationsEntityReferenceWriteService,
  ],
})
export class EvaluationsAnalyticsModule {}
