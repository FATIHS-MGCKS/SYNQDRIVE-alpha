import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTaskAutomationWorkflowRuntimeMode } from '@config/task-automation-workflow-runtime.config';
import type {
  TaskAutomationExecutionRouteInput,
  TaskAutomationShadowResult,
} from './task-automation-workflow-bridge.types';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';

@Injectable()
export class TaskAutomationExecutionRouterService {
  private readonly logger = new Logger(TaskAutomationExecutionRouterService.name);
  private readonly shadowLog: TaskAutomationShadowResult[] = [];

  constructor(
    private readonly materializer: TaskAutomationWorkflowMaterializerService,
    private readonly config: ConfigService,
  ) {}

  getMode() {
    return (
      this.config.get<ReturnType<typeof resolveTaskAutomationWorkflowRuntimeMode>>(
        'taskAutomationWorkflowRuntime.mode',
      ) ?? resolveTaskAutomationWorkflowRuntimeMode()
    );
  }

  drainShadowLog(): TaskAutomationShadowResult[] {
    const copy = [...this.shadowLog];
    this.shadowLog.length = 0;
    return copy;
  }

  async route(input: TaskAutomationExecutionRouteInput): Promise<void> {
    const mode = this.getMode();

    if (mode === 'legacy' || mode === 'shadow') {
      await input.legacyExecute();
    }

    if (mode === 'shadow') {
      const { shadow } = await this.materializer.materializeViaWorkflow(input.payload, 'preview');
      if (shadow) {
        this.shadowLog.push(shadow);
        this.logger.debug(
          `Shadow workflow preview for ${input.payload.catalogKey} dedup=${input.payload.dedupKey}: ${shadow.previewSummary}`,
        );
      }
      return;
    }

    if (mode === 'cutover') {
      await this.materializer.materializeViaWorkflow(input.payload, 'execute');
    }
  }
}
