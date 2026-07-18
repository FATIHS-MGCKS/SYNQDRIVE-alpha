import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationsV2ConfigService } from './stations-v2-config.service';
import { StationsV2FeatureGuard } from './guards/stations-v2-feature.guard';
import { StationRuleEngineService } from './booking-rules/station-rule-engine.service';
import { StationReadModelService } from './read-model/station-read-model.service';
import { StationDomainAuditService } from './audit/station-domain-audit.service';
import { StationTransferService } from './transfers/station-transfer.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';

@Module({
  imports: [ActivityLogModule],
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationsV2ConfigService,
    StationsV2FeatureGuard,
    StationRuleEngineService,
    StationReadModelService,
    StationDomainAuditService,
    StationTransferService,
    StationAccessService,
    StationScopeGuard,
  ],
  exports: [
    StationsService,
    StationValidationService,
    StationsV2ConfigService,
    StationRuleEngineService,
    StationAccessService,
  ],
})
export class StationsModule {}
