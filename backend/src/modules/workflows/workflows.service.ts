import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';

const STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  DISABLED: 'Disabled',
};

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  private format(wf: Record<string, unknown>) {
    return {
      ...wf,
      statusLabel: STATUS_DISPLAY[(wf.status as string)] || wf.status,
    };
  }

  async findByOrg(orgId: string, filters?: { status?: string; category?: string }) {
    const where: Prisma.OrgWorkflowWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as any;
    if (filters?.category) where.category = filters.category;

    const rows = await this.prisma.orgWorkflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.format(r as unknown as Record<string, unknown>));
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Workflow not found');
    return this.format(row as unknown as Record<string, unknown>);
  }

  async create(orgId: string, data: {
    name: string;
    description?: string;
    category: string;
    trigger: any;
    conditions?: any;
    actions: any;
    scope?: any;
    status?: string;
    createdById?: string;
    createdByName?: string;
  }) {
    const row = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description,
        category: data.category,
        trigger: data.trigger as any,
        conditions: (data.conditions || []) as any,
        actions: data.actions as any,
        scope: (data.scope || { type: 'organization' }) as any,
        status: (data.status as any) || 'DRAFT',
        createdById: data.createdById,
        createdByName: data.createdByName,
        updatedById: data.createdById,
        updatedByName: data.createdByName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async update(orgId: string, id: string, data: {
    name?: string;
    description?: string;
    category?: string;
    trigger?: any;
    conditions?: any;
    actions?: any;
    scope?: any;
    status?: string;
    updatedById?: string;
    updatedByName?: string;
  }) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.trigger !== undefined) updateData.trigger = data.trigger;
    if (data.conditions !== undefined) updateData.conditions = data.conditions;
    if (data.actions !== undefined) updateData.actions = data.actions;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.updatedById) updateData.updatedById = data.updatedById;
    if (data.updatedByName) updateData.updatedByName = data.updatedByName;

    const row = await this.prisma.orgWorkflow.update({
      where: { id },
      data: updateData,
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async toggleStatus(orgId: string, id: string, userId?: string, userName?: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const newStatus = existing.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const row = await this.prisma.orgWorkflow.update({
      where: { id },
      data: { status: newStatus, updatedById: userId, updatedByName: userName },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async duplicate(orgId: string, id: string, userId?: string, userName?: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const row = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: `${existing.name} (Kopie)`,
        description: existing.description,
        category: existing.category,
        trigger: existing.trigger as any,
        conditions: existing.conditions as any,
        actions: existing.actions as any,
        scope: existing.scope as any,
        status: 'DRAFT',
        createdById: userId,
        createdByName: userName,
        updatedById: userId,
        updatedByName: userName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async remove(orgId: string, id: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');
    await this.prisma.orgWorkflow.delete({ where: { id } });
    return { success: true };
  }

  async getStats(orgId: string) {
    const [total, active, draft, disabled] = await Promise.all([
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'DRAFT' } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'DISABLED' } }),
    ]);
    return { total, active, draft, disabled };
  }
}
