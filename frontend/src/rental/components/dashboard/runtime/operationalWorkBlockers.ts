import type { ApiServiceCase, ApiTask } from '../../../../lib/api';
import {
  blockingServiceCasesForVehicle,
  createServiceCaseRuntimeReason,
} from './serviceCaseRuntimeReasons';
import {
  blockingTasksForVehicle,
  createTaskRuntimeReason,
} from './taskRuntimeReasons';
import type { RuntimeReason } from './dashboardRuntimeTypes';

export interface BuildOperationalWorkBlockersInput {
  vehicleId: string;
  tasks?: ApiTask[];
  serviceCases?: ApiServiceCase[];
}

/**
 * Builds operational work blockers from Service Cases and Tasks.
 * Service cases are parent blockers; linked tasks render as non-blocking children
 * to avoid duplicate rental blocks when both reference the same work item.
 */
export function buildOperationalWorkBlockersForVehicle(
  input: BuildOperationalWorkBlockersInput,
): RuntimeReason[] {
  const blockingCases = blockingServiceCasesForVehicle(input.serviceCases, input.vehicleId);
  const blockingCaseIds = new Set(blockingCases.map((serviceCase) => serviceCase.id));
  const activeBlockingTasks = blockingTasksForVehicle(input.tasks, input.vehicleId);

  const reasons: RuntimeReason[] = [];
  const linkedTaskIds = new Set<string>();

  for (const serviceCase of blockingCases) {
    const caseReason = createServiceCaseRuntimeReason(serviceCase);
    reasons.push(caseReason);

    for (const task of activeBlockingTasks) {
      if (task.serviceCaseId !== serviceCase.id) continue;
      linkedTaskIds.add(task.id);
      reasons.push(
        createTaskRuntimeReason(task, {
          parentReasonId: caseReason.id,
          parentServiceCaseId: serviceCase.id,
          blocking: false,
        }),
      );
    }
  }

  for (const task of activeBlockingTasks) {
    if (linkedTaskIds.has(task.id)) continue;
    if (task.serviceCaseId && blockingCaseIds.has(task.serviceCaseId)) continue;
    reasons.push(createTaskRuntimeReason(task));
  }

  return reasons;
}
