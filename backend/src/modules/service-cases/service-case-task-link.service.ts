import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCaseStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService, type CreateManualTaskInput } from '@modules/tasks/tasks.service';
import type { CreateServiceCaseTaskDto } from './dto/service-case-task.dto';

const TERMINAL_CASE_STATUSES = new Set<ServiceCaseStatus>(['COMPLETED', 'CANCELLED']);
const OPEN_TASK_STATUSES = new Set<TaskStatus>(['OPEN', 'IN_PROGRESS', 'WAITING']);

const TASK_LINK_AUDIT_PREFIX = '[task-link]';

@Injectable()
export class ServiceCaseTaskLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  private async loadCaseOrThrow(orgId: string, caseId: string) {
    const row = await this.prisma.serviceCase.findFirst({
      where: { id: caseId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        vendorId: true,
        status: true,
        title: true,
      },
    });
    if (!row) throw new NotFoundException('Service case not found');
    return row;
  }

  private async loadTaskOrThrow(orgId: string, taskId: string) {
    const row = await this.prisma.orgTask.findFirst({
      where: { id: taskId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        vendorId: true,
        serviceCaseId: true,
        title: true,
        status: true,
      },
    });
    if (!row) throw new NotFoundException('Task not found');
    return row;
  }

  private assertCaseAcceptsNewLinks(status: ServiceCaseStatus) {
    if (TERMINAL_CASE_STATUSES.has(status)) {
      throw new BadRequestException('Cannot link tasks to a completed or cancelled service case');
    }
  }

  private assertVehicleMatch(caseVehicleId: string, taskVehicleId: string | null) {
    if (!taskVehicleId) {
      throw new BadRequestException('Task must have a vehicle before linking to a service case');
    }
    if (taskVehicleId !== caseVehicleId) {
      throw new BadRequestException('Task vehicle does not match service case vehicle');
    }
  }

  private assertVendorMatch(
    caseVendorId: string | null,
    taskVendorId: string | null,
  ) {
    if (caseVendorId && taskVendorId && caseVendorId !== taskVendorId) {
      throw new BadRequestException('Task vendor does not match service case vendor');
    }
  }

  private auditComment(action: 'linked' | 'unlinked', taskTitle: string, taskId: string) {
    const verb = action === 'linked' ? 'verknüpft' : 'getrennt';
    return `${TASK_LINK_AUDIT_PREFIX} Aufgabe „${taskTitle.trim()}“ ${verb} (${taskId})`;
  }

  private async recordTaskLinkEvent(
    tx: Prisma.TransactionClient,
    taskId: string,
    type: 'SERVICE_CASE_LINKED' | 'SERVICE_CASE_UNLINKED',
    actorUserId: string | null | undefined,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.taskEvent.create({
      data: {
        taskId,
        type,
        actorUserId: actorUserId ?? null,
        oldValue: null,
        newValue: null,
        metadata,
      },
    });
  }

  async linkTask(orgId: string, caseId: string, taskId: string, userId?: string) {
    const serviceCase = await this.loadCaseOrThrow(orgId, caseId);
    const task = await this.loadTaskOrThrow(orgId, taskId);

    this.assertCaseAcceptsNewLinks(serviceCase.status);
    this.assertVehicleMatch(serviceCase.vehicleId, task.vehicleId);
    this.assertVendorMatch(serviceCase.vendorId, task.vendorId);

    if (task.serviceCaseId && task.serviceCaseId !== caseId) {
      throw new BadRequestException('Task is already linked to another service case');
    }
    if (task.serviceCaseId === caseId) {
      return this.tasksService.getTaskById(taskId, orgId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: taskId },
        data: { serviceCaseId: caseId },
      });
      await this.recordTaskLinkEvent(tx, taskId, 'SERVICE_CASE_LINKED', userId, {
        serviceCaseId: caseId,
        serviceCaseTitle: serviceCase.title,
      } as Prisma.InputJsonValue);
      await tx.serviceCaseComment.create({
        data: {
          serviceCaseId: caseId,
          body: this.auditComment('linked', task.title, taskId),
          userId: userId ?? null,
        },
      });
    });

    return this.tasksService.getTaskById(taskId, orgId);
  }

  async unlinkTask(orgId: string, caseId: string, taskId: string, userId?: string) {
    const serviceCase = await this.loadCaseOrThrow(orgId, caseId);
    const task = await this.loadTaskOrThrow(orgId, taskId);

    if (task.serviceCaseId !== caseId) {
      throw new BadRequestException('Task is not linked to this service case');
    }

    // Unlink is allowed on terminal cases to resolve operational inconsistencies.
    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: taskId },
        data: { serviceCaseId: null },
      });
      await this.recordTaskLinkEvent(tx, taskId, 'SERVICE_CASE_UNLINKED', userId, {
        serviceCaseId: caseId,
        serviceCaseTitle: serviceCase.title,
        serviceCaseStatus: serviceCase.status,
      } as Prisma.InputJsonValue);
      await tx.serviceCaseComment.create({
        data: {
          serviceCaseId: caseId,
          body: this.auditComment('unlinked', task.title, taskId),
          userId: userId ?? null,
        },
      });
    });

    return this.tasksService.getTaskById(taskId, orgId);
  }

  async createTask(
    orgId: string,
    caseId: string,
    input: CreateServiceCaseTaskDto,
    userId?: string,
  ) {
    const serviceCase = await this.loadCaseOrThrow(orgId, caseId);
    this.assertCaseAcceptsNewLinks(serviceCase.status);

    const payload: CreateManualTaskInput = {
      title: input.title,
      description: input.description,
      type: input.type ?? 'VEHICLE_SERVICE',
      priority: input.priority,
      category: input.category,
      dueDate: input.dueDate,
      assignedUserId: input.assignedUserId,
      vehicleId: serviceCase.vehicleId,
      vendorId: input.vendorId ?? serviceCase.vendorId ?? undefined,
      serviceCaseId: caseId,
      estimatedCostCents: input.estimatedCostCents,
      blocksVehicleAvailability: input.blocksVehicleAvailability,
      initialNote: input.initialNote,
      checklist: input.checklist,
      sourceType: 'MANUAL',
    };

    const created = await this.tasksService.createManualTask(orgId, payload, userId);

    await this.prisma.serviceCaseComment.create({
      data: {
        serviceCaseId: caseId,
        body: this.auditComment('linked', created.title, created.id),
        userId: userId ?? null,
      },
    });

    return created;
  }

  countOpenTasks(
    tasks: Array<{ status: TaskStatus }>,
  ): number {
    return tasks.filter((task) => OPEN_TASK_STATUSES.has(task.status)).length;
  }
}
