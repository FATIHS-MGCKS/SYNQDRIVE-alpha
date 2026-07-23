import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { BookingObservabilityService } from './booking-observability.service';
import { BookingProcessingFailureRepository } from './booking-processing-failure.repository';
import { BookingObservabilityMonitoringScheduler } from './booking-observability-monitoring.scheduler';

@Module({
  imports: [PrismaModule, ObservabilityModule],
  providers: [
    BookingObservabilityService,
    BookingProcessingFailureRepository,
    BookingObservabilityMonitoringScheduler,
  ],
  exports: [BookingObservabilityService],
})
export class BookingObservabilityModule {}
