import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs.handler.registry';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';

@Injectable()
export class DrivingIntelligenceJobProcessorService {
  private readonly logger = new Logger(DrivingIntelligenceJobProcessorService.name);

  constructor(
    private readonly repository: DrivingIntelligenceJobRepository,
    private readonly handlerRegistry: DrivingIntelligenceJobHandlerRegistry,
  ) {}

  async processPersistentJob(organizationId: string, persistentJobId: string): Promise<'completed' | 'failed'> {
    const job = await this.repository.findById(organizationId, persistentJobId);
    if (!job) {
      throw new NotFoundException(`Driving intelligence job ${persistentJobId} not found`);
    }

    if (this.repository.isTerminalStatus(job.status)) {
      this.logger.debug(
        `Skipping driving intelligence job ${persistentJobId} — terminal status ${job.status}`,
      );
      return job.status === 'COMPLETED' ? 'completed' : 'failed';
    }

    await this.repository.markInProgress(persistentJobId);

    try {
      await this.handlerRegistry.dispatch(job);
      await this.repository.markCompleted(persistentJobId);
      this.logger.log(
        `Driving intelligence job completed: id=${persistentJobId} type=${job.jobType}`,
      );
      return 'completed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repository.markFailed(persistentJobId, 'HANDLER_FAILED', message);
      this.logger.error(
        `Driving intelligence job failed: id=${persistentJobId} type=${job.jobType} ${message}`,
      );
      return 'failed';
    }
  }
}
