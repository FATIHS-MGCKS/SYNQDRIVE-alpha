import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workflowRuntimeConfig from '@config/workflow-runtime.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { WorkflowEventOutboxCoreModule } from '../outbox/workflow-event-outbox-core.module';
import { WorkflowTimerRepository } from './cancellation/workflow-timer.repository';
import { WorkflowDurableTimerService } from './timers/workflow-durable-timer.service';
import { BookingPickupOverdueRecheckService } from './timers/booking-pickup-overdue-recheck.service';
import { BookingPickupOverdueTimerService } from './timers/booking-pickup-overdue-timer.service';

@Module({
  imports: [PrismaModule, ConfigModule.forFeature(workflowRuntimeConfig), WorkflowEventOutboxCoreModule],
  providers: [
    WorkflowTimerRepository,
    WorkflowDurableTimerService,
    BookingPickupOverdueRecheckService,
    BookingPickupOverdueTimerService,
  ],
  exports: [
    WorkflowTimerRepository,
    WorkflowDurableTimerService,
    BookingPickupOverdueRecheckService,
    BookingPickupOverdueTimerService,
  ],
})
export class WorkflowTimersCoreModule {}
