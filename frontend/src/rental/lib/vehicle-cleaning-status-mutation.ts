import { api } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { classifyVehicleStatusPatchMutationError } from './vehicle-status-patch-mutation-shared';

/** UI labels for cleaning status in Vehicle Detail header — separate from operational status. */
export type VehicleCleaningUiStatus = 'Clean' | 'Needs Cleaning';

export type VehicleCleaningPrismaStatus = 'CLEAN' | 'NEEDS_CLEANING';

export const VEHICLE_CLEANING_UI_STATUSES = [
  'Clean',
  'Needs Cleaning',
] as const satisfies readonly VehicleCleaningUiStatus[];

export type VehicleCleaningStatusMutationLocale = 'de' | 'en';

export interface VehicleCleaningStatusMutationInput {
  orgId: string;
  vehicleId: string;
  uiStatus: VehicleCleaningUiStatus;
}

export interface VehicleCleaningTaskMutationResult {
  action: 'created' | 'existing' | 'updated' | 'completed' | 'none';
  taskId?: string;
  completedCount?: number;
}

export interface VehicleCleaningStatusMutationResult {
  prismaStatus: VehicleCleaningPrismaStatus;
  cleaningTask?: VehicleCleaningTaskMutationResult | null;
}

export interface CleaningStatusMutationSideEffect {
  toast: {
    type: 'success' | 'info' | 'warning';
    title: string;
    description?: string;
  };
  highlightedTaskId?: string;
  openVehicleTasks?: boolean;
}

export function deriveVehicleDetailHeaderCleaningStatus(
  vehicle: Pick<VehicleData, 'cleaningStatus'>,
): VehicleCleaningUiStatus {
  return mapCleaningPrismaOrDisplayToUi(vehicle.cleaningStatus);
}

export function mapCleaningUiStatusToPrisma(
  uiStatus: VehicleCleaningUiStatus,
): VehicleCleaningPrismaStatus {
  return uiStatus === 'Needs Cleaning' ? 'NEEDS_CLEANING' : 'CLEAN';
}

export function mapCleaningPrismaStatusToUi(
  prismaStatus: VehicleCleaningPrismaStatus,
): VehicleCleaningUiStatus {
  return prismaStatus === 'NEEDS_CLEANING' ? 'Needs Cleaning' : 'Clean';
}

export function mapCleaningPrismaOrDisplayToUi(
  raw: string | null | undefined,
): VehicleCleaningUiStatus {
  const value = String(raw ?? '').toLowerCase();
  return value.includes('need') ? 'Needs Cleaning' : 'Clean';
}

export function shouldWarnBeforeCleaningStatusChange(
  nextUiStatus: VehicleCleaningUiStatus,
): boolean {
  return nextUiStatus === 'Needs Cleaning';
}

export function classifyVehicleCleaningStatusMutationError(
  error: unknown,
  locale: VehicleCleaningStatusMutationLocale = 'de',
): string {
  return classifyVehicleStatusPatchMutationError(error, locale, 'cleaning');
}

export async function mutateVehicleCleaningStatus(
  input: VehicleCleaningStatusMutationInput,
): Promise<VehicleCleaningStatusMutationResult> {
  const prismaStatus = mapCleaningUiStatusToPrisma(input.uiStatus);
  const res = await api.vehicles.updateOperationalStatus(input.orgId, input.vehicleId, {
    cleaningStatus: prismaStatus,
  });
  return {
    prismaStatus,
    cleaningTask: res.cleaningTask ?? null,
  };
}

/**
 * Task side-effects only — does not imply rental readiness or operational availability.
 * Preserves existing product behaviour for cleaning-task creation/completion feedback.
 */
export function resolveCleaningStatusMutationSideEffects(
  prismaStatus: VehicleCleaningPrismaStatus,
  result: VehicleCleaningStatusMutationResult,
): CleaningStatusMutationSideEffect | null {
  const action = result.cleaningTask?.action;

  if (prismaStatus === 'NEEDS_CLEANING') {
    if (action === 'created') {
      return {
        toast: {
          type: 'success',
          title: 'Reinigungsaufgabe erstellt',
          description: 'Die Aufgabe erscheint im Task-Tab dieses Fahrzeugs.',
        },
        highlightedTaskId: result.cleaningTask?.taskId,
        openVehicleTasks: Boolean(result.cleaningTask?.taskId),
      };
    }
    if (action === 'existing') {
      return {
        toast: {
          type: 'info',
          title: 'Offene Reinigungsaufgabe bereits vorhanden',
          description: 'Es wurde keine Duplikat-Aufgabe erstellt.',
        },
        highlightedTaskId: result.cleaningTask?.taskId,
        openVehicleTasks: Boolean(result.cleaningTask?.taskId),
      };
    }
    return {
      toast: {
        type: 'warning',
        title: 'Reinigungsstatus gespeichert',
        description: 'Die Reinigungsaufgabe konnte nicht angelegt werden.',
      },
    };
  }

  if (action === 'completed') {
    const completedCount = result.cleaningTask?.completedCount ?? 0;
    return {
      toast: {
        type: 'success',
        title: 'Reinigungsaufgabe abgeschlossen',
        description:
          completedCount > 1
            ? `${completedCount} offene Reinigungsaufgaben wurden abgeschlossen.`
            : 'Fahrzeug als sauber markiert.',
      },
    };
  }

  return {
    toast: {
      type: 'success',
      title: 'Fahrzeug als sauber markiert',
    },
  };
}
