import type { ApiServiceCase, ApiServiceCaseTaskRef } from '../../../lib/api';
import { isActiveServiceCaseStatus } from './fleet-health-service-case-detail';

export const SERVICE_CASE_TASK_LINK_AUDIT_PREFIX = '[task-link]';

export function isServiceCaseTaskLinkAuditComment(body: string): boolean {
  return body.trimStart().startsWith(SERVICE_CASE_TASK_LINK_AUDIT_PREFIX);
}

export function serviceCaseTaskLinkAuditTitle(body: string): string {
  if (body.includes('getrennt')) return 'Aufgabenverknüpfung getrennt';
  if (body.includes('verknüpft')) return 'Aufgabe verknüpft';
  return 'Aufgabenverknüpfung';
}

export function canLinkTaskToServiceCase(
  serviceCase: Pick<ApiServiceCase, 'status'>,
): boolean {
  return isActiveServiceCaseStatus(serviceCase.status);
}

export function canUnlinkTaskFromServiceCase(
  serviceCase: Pick<ApiServiceCase, 'status'>,
  task: Pick<ApiServiceCaseTaskRef, 'status'>,
): boolean {
  if (!isActiveServiceCaseStatus(serviceCase.status)) {
    // Allow unlink on terminal cases when task is still open (inconsistency repair).
    return task.status !== 'DONE' && task.status !== 'CANCELLED';
  }
  return true;
}

export function hasServiceCaseOpenTaskInconsistency(
  serviceCase: Pick<ApiServiceCase, 'status' | 'tasks' | 'openTaskCount'>,
): boolean {
  if (isActiveServiceCaseStatus(serviceCase.status)) return false;
  const openCount =
    typeof serviceCase.openTaskCount === 'number'
      ? serviceCase.openTaskCount
      : (serviceCase.tasks ?? []).filter(
          (task) => task.status !== 'DONE' && task.status !== 'CANCELLED',
        ).length;
  return openCount > 0;
}

export function resolveServiceCaseOpenTaskCount(
  serviceCase: Pick<ApiServiceCase, 'tasks' | 'openTaskCount' | 'taskCount' | 'status'>,
): number {
  if (typeof serviceCase.openTaskCount === 'number') return serviceCase.openTaskCount;
  if (serviceCase.tasks?.length) {
    return serviceCase.tasks.filter(
      (task) => task.status !== 'DONE' && task.status !== 'CANCELLED',
    ).length;
  }
  if (!isActiveServiceCaseStatus(serviceCase.status)) return 0;
  return serviceCase.taskCount ?? 0;
}

export function filterLinkableVehicleTasks<T extends { id: string; vehicleId?: string | null; serviceCaseId?: string | null; status: string }>(
  tasks: T[],
  vehicleId: string,
  serviceCaseId: string,
): T[] {
  return tasks.filter((task) => {
    if (task.vehicleId !== vehicleId) return false;
    if (task.status === 'DONE' || task.status === 'CANCELLED') return false;
    if (task.serviceCaseId && task.serviceCaseId !== serviceCaseId) return false;
    return !task.serviceCaseId;
  });
}
