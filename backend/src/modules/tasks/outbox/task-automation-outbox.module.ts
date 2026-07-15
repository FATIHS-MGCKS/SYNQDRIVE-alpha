import { Module } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { BusinessInsightsModule } from '@modules/business-insights/business-insights.module';
import { TasksModule } from '../tasks.module';
import { TaskAutomationOutboxCoreModule } from './task-automation-outbox-core.module';
import { TaskAutomationOutboxExecutorService } from './task-automation-outbox-executor.service';
import { TaskAutomationOutboxProcessorService } from './task-automation-outbox-processor.service';

/** Worker-side dispatch — imports automation services and executes outbox payloads. */
@Module({
  imports: [
    TaskAutomationOutboxCoreModule,
    TasksModule,
    InvoicesModule,
    DocumentsModule,
    BusinessInsightsModule,
  ],
  providers: [TaskAutomationOutboxExecutorService, TaskAutomationOutboxProcessorService],
  exports: [
    TaskAutomationOutboxExecutorService,
    TaskAutomationOutboxProcessorService,
    TaskAutomationOutboxCoreModule,
  ],
})
export class TaskAutomationOutboxModule {}
