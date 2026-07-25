import { Module } from '@nestjs/common';
import { StationsModule } from '@modules/stations/stations.module';
import { OperatorResourceScopeService } from './operator-resource-scope.service';

@Module({
  imports: [StationsModule],
  providers: [OperatorResourceScopeService],
  exports: [OperatorResourceScopeService],
})
export class OperatorAppModule {}
