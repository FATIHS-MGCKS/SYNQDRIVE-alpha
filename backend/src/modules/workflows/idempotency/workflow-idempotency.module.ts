import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workflowRuntimeConfig from '@config/workflow-runtime.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { WorkflowIdempotencyService } from './workflow-idempotency.service';

@Module({
  imports: [PrismaModule, ConfigModule.forFeature(workflowRuntimeConfig)],
  providers: [WorkflowIdempotencyService],
  exports: [WorkflowIdempotencyService],
})
export class WorkflowIdempotencyModule {}
