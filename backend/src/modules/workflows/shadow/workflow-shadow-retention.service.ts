import { Injectable, Logger } from '@nestjs/common';
import { WorkflowShadowService } from './workflow-shadow.service';

@Injectable()
export class WorkflowShadowRetentionService {
  private readonly logger = new Logger(WorkflowShadowRetentionService.name);

  constructor(private readonly shadow: WorkflowShadowService) {}

  async runRetentionSweep(organizationId?: string): Promise<{ deleted: number }> {
    const deleted = await this.shadow.purgeExpired(organizationId);
    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} expired workflow shadow run(s)`);
    }
    return { deleted };
  }
}
