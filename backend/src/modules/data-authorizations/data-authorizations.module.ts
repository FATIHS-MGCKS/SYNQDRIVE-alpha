import { Module } from '@nestjs/common';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { GpsPositionAccessService } from './gps-position-access.service';

@Module({
  controllers: [DataAuthorizationsController],
  providers: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    GpsPositionAccessService,
  ],
  exports: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    GpsPositionAccessService,
  ],
})
export class DataAuthorizationsModule {}
