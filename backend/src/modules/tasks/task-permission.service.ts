import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  TASK_PERMISSION_REQUIREMENTS,
  type TaskPermissionAction,
} from './task-permission.constants';

@Injectable()
export class TaskPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async assert(actor: PermissionActor, orgId: string, action: TaskPermissionAction): Promise<void> {
    const requirement = TASK_PERMISSION_REQUIREMENTS[action];
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      requirement.module,
      requirement.level,
    );
  }
}
