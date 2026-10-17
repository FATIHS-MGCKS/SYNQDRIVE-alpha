import { Module } from '@nestjs/common';
import { Dtc02ObservabilityService } from './dtc02-observability.service';

@Module({
  providers: [Dtc02ObservabilityService],
  exports: [Dtc02ObservabilityService],
})
export class Dtc02ObservabilityModule {}
