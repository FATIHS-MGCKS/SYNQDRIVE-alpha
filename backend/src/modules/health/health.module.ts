import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ApplicationHealthModule } from './application-health.module';

@Module({
  imports: [ApplicationHealthModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService, ApplicationHealthModule],
})
export class HealthModule {}
