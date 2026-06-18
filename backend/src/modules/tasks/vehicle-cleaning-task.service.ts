import { Injectable } from '@nestjs/common';
import { TaskPriority, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from './tasks.service';
import { checklistForType } from './task-templates';

export type CleaningTaskAction = 'created' | 'existing' | 'updated' | 'completed' | 'none';

export interface CleaningTaskMaterializeResult {
  action: CleaningTaskAction;
  taskId?: string;
  completedCount?: number;
}

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;

function cleaningDedupKey(vehicleId: string): string {
  return `vehicle:cleaning:${vehicleId}`;
}

@Injectable()
export class VehicleCleaningTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  /**
   * Ensures exactly one active cleaning task exists for the vehicle.
   * Uses dedupKey + open-task scan so legacy rows without dedupKey are reused.
   */
  async ensureCleaningTask(orgId: string, vehicleId: string): Promise<CleaningTaskMaterializeResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        organizationId: true,
      },
    });
    if (!vehicle) {
      return { action: 'none' };
    }

    const existingOpen = await this.findOpenCleaningTask(orgId, vehicleId);
    if (existingOpen) {
      if (!existingOpen.dedupKey) {
        await this.prisma.orgTask.update({
          where: { id: existingOpen.id },
          data: { dedupKey: cleaningDedupKey(vehicleId) },
        });
      }
      const full = await this.tasks.getTaskById(existingOpen.id, orgId);
      return { action: 'existing', taskId: full.id };
    }

    const priority = await this.resolveCleaningPriority(orgId, vehicleId);
    const label = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.licensePlate || vehicleId;
    const plate = vehicle.licensePlate ?? '—';

    const task = await this.tasks.upsertByDedup(orgId, cleaningDedupKey(vehicleId), {
      title: 'Vehicle cleaning required',
      description: `Interior/exterior cleaning required for ${label} (${plate}).`,
      category: 'Cleaning',
      type: 'VEHICLE_CLEANING' as TaskType,
      sourceType: 'SYSTEM',
      source: 'VEHICLE_CLEANING',
      vehicleId,
      priority,
      blocksVehicleAvailability: true,
      checklist: checklistForType('VEHICLE_CLEANING'),
      metadata: {
        origin: 'VEHICLE_CLEANING',
        vehicleId,
      },
    });

    return { action: 'created', taskId: task.id };
  }

  /** Completes all active cleaning tasks when the vehicle is marked clean. */
  async completeOpenCleaningTasks(
    orgId: string,
    vehicleId: string,
    actorUserId?: string,
  ): Promise<CleaningTaskMaterializeResult> {
    const openTasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        type: 'VEHICLE_CLEANING',
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: { id: true },
    });

    if (openTasks.length === 0) {
      return { action: 'none', completedCount: 0 };
    }

    for (const row of openTasks) {
      await this.tasks.completeTask(orgId, row.id, {
        resolutionNote: 'Vehicle marked as clean',
      }, actorUserId);
    }

    return {
      action: 'completed',
      completedCount: openTasks.length,
      taskId: openTasks[0]?.id,
    };
  }

  private async findOpenCleaningTask(orgId: string, vehicleId: string) {
    return this.prisma.orgTask.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        type: 'VEHICLE_CLEANING',
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async resolveCleaningPriority(orgId: string, vehicleId: string): Promise<TaskPriority> {
    const nextBooking = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gt: new Date() },
      },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    if (!nextBooking?.startDate) return 'NORMAL';
    const hoursUntil = (nextBooking.startDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursUntil <= 24 ? 'HIGH' : 'NORMAL';
  }
}
