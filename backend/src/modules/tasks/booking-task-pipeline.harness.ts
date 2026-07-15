import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskLinkedObjectResolverService } from './task-linked-object-resolver.service';
import { TaskAutomationService } from './task-automation.service';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TasksService } from './tasks.service';
import { createBookingTaskTestStore, type BookingTaskTestStore } from './booking-task-test-store';
import { createNoopTaskAutomationOutboxDeps } from './outbox/task-automation-outbox-test.util';
import { createDefaultTaskAutomationRuleResolverMock } from './automation/task-automation-rule-resolver.test.util';

export interface BookingTaskPipelineHarness {
  store: BookingTaskTestStore;
  tasks: TasksService;
  automation: TaskAutomationService;
  vehicleCleaningTasks: VehicleCleaningTaskService;
}

export function createBookingTaskPipelineHarness(options?: {
  now?: () => Date;
}): BookingTaskPipelineHarness {
  const store = createBookingTaskTestStore(options);
  const prisma = store.prisma as unknown as PrismaService;

  const activityLog = { log: jest.fn() } as unknown as ActivityLogService;
  const linkedObjectResolver = {
    resolveForTask: jest.fn().mockResolvedValue([]),
  } as unknown as TaskLinkedObjectResolverService;

  const tasks = new TasksService(prisma, activityLog, linkedObjectResolver);
  const { outboxEnqueue, outboxContext } = createNoopTaskAutomationOutboxDeps();
  const vehicleCleaningTasks = new VehicleCleaningTaskService(
    prisma,
    tasks,
    outboxEnqueue,
    outboxContext,
    createDefaultTaskAutomationRuleResolverMock(),
  );
  const automation = new TaskAutomationService(
    tasks,
    prisma,
    vehicleCleaningTasks,
    outboxEnqueue,
    outboxContext,
    createDefaultTaskAutomationRuleResolverMock(),
  );

  return { store, tasks, automation, vehicleCleaningTasks };
}
