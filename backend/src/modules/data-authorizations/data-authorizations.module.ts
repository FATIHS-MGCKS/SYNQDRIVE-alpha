import { Module } from '@nestjs/common';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';

@Module({
  controllers: [DataAuthorizationsController],
  providers: [DataAuthorizationsService],
  exports: [DataAuthorizationsService],
})
export class DataAuthorizationsModule {}
