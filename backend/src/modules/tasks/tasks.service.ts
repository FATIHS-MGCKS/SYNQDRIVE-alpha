import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private format(t: Record<string, unknown>) {
    return {
      id: t.id,
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      status: t.status,
      priority: t.priority,
      vehicleId: t.vehicleId || null,
      fineId: t.fineId || null,
      assignedTo: t.assignedTo || null,
      dueDate: (t.dueDate as Date)?.toISOString?.() || null,
      completedAt: (t.completedAt as Date)?.toISOString?.() || null,
      createdAt: (t.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (t.updatedAt as Date)?.toISOString?.() || '',
    };
  }

  async findByOrg(orgId: string) {
    const tasks = await this.prisma.orgTask.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((t) => this.format(t as unknown as Record<string, unknown>));
  }

  async findById(id: string) {
    const task = await this.prisma.orgTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.format(task as unknown as Record<string, unknown>);
  }

  async create(orgId: string, data: {
    title: string;
    description?: string;
    category?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    vehicleId?: string;
    fineId?: string;
    invoiceId?: string;
    assignedTo?: string;
    dueDate?: string;
  }, createdByUserId?: string) {
    const task = await this.prisma.orgTask.create({
      data: {
        organizationId: orgId,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority || 'MEDIUM',
        vehicleId: data.vehicleId,
        fineId: data.fineId,
        invoiceId: data.invoiceId,
        createdByUserId: createdByUserId ?? null,
        assignedTo: data.assignedTo,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    return this.format(task as unknown as Record<string, unknown>);
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    assignedTo?: string;
    dueDate?: string;
  }) {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'DONE') updateData.completedAt = new Date();
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const task = await this.prisma.orgTask.update({ where: { id }, data: updateData });
    return this.format(task as unknown as Record<string, unknown>);
  }
}
