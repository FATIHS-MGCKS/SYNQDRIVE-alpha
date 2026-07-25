import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { WorkflowMatcherRepository } from './workflow-matcher.repository';
import { WorkflowMatcherService } from './workflow-matcher.service';

@Module({
  imports: [PrismaModule],
  providers: [WorkflowMatcherRepository, WorkflowMatcherService],
  exports: [WorkflowMatcherService, WorkflowMatcherRepository],
})
export class WorkflowMatcherModule {}
