import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { StationsModule } from '@modules/stations/stations.module';
import { EvaluationsAnalyticsController } from './evaluations-analytics.controller';
import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';

@Module({
  imports: [PrismaModule, StationsModule],
  controllers: [EvaluationsAnalyticsController],
  providers: [
    EvaluationsAnalyticsScopeService,
    EvaluationsAnalyticsService,
    EvaluationsEntityReferenceRepository,
  ],
  exports: [
    EvaluationsAnalyticsScopeService,
    EvaluationsAnalyticsService,
    EvaluationsEntityReferenceRepository,
  ],
})
export class EvaluationsAnalyticsModule {}
