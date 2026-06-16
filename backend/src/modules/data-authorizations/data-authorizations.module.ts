import { Module } from '@nestjs/common';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';

@Module({
  controllers: [DataAuthorizationsController],
  providers: [DataAuthorizationsService, DataAuthorizationEnforcementService],
  exports: [DataAuthorizationsService, DataAuthorizationEnforcementService],
})
export class DataAuthorizationsModule {}
