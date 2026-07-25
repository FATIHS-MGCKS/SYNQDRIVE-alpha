import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { WorkflowAuditService } from './workflow-audit.service';

@Module({
  imports: [ActivityLogModule],
  providers: [WorkflowAuditService],
  exports: [WorkflowAuditService],
})
export class WorkflowAuditModule {}
