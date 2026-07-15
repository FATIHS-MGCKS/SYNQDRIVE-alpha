import { TaskAutomationOutboxEnqueueService } from './task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from './task-automation-outbox-execution.context';

export function createNoopTaskAutomationOutboxDeps(): {
  outboxEnqueue: TaskAutomationOutboxEnqueueService;
  outboxContext: TaskAutomationOutboxExecutionContext;
} {
  const outboxContext = new TaskAutomationOutboxExecutionContext();
  const outboxEnqueue = {
    isEnabled: () => false,
    enqueueFailure: jest.fn().mockResolvedValue(null),
  } as unknown as TaskAutomationOutboxEnqueueService;
  return { outboxEnqueue, outboxContext };
}
