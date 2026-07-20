import type { ServiceCenterData } from '../service-center/service-center.types';

export interface FleetHealthServiceTaskSourceState {
  loading: boolean;
  error: string | null;
  tasksStatus: ServiceCenterData['tasks']['status'];
  taskSummaryStatus: ServiceCenterData['taskSummary']['status'];
}

/** Task panel loading/error derived from Service Center source slices (no extra fetch). */
export function resolveFleetHealthServiceTaskSourceState(
  service: Pick<ServiceCenterData, 'tasks' | 'taskSummary'>,
): FleetHealthServiceTaskSourceState {
  const loading =
    service.tasks.status === 'loading' || service.taskSummary.status === 'loading';
  const error = service.tasks.error ?? service.taskSummary.error;

  return {
    loading,
    error,
    tasksStatus: service.tasks.status,
    taskSummaryStatus: service.taskSummary.status,
  };
}
