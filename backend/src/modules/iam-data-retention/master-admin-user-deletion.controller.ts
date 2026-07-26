import {
  Controller,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { UsersService } from '@modules/users/users.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { IamUserDeletionService } from './iam-user-deletion.service';

interface AuthedRequest {
  user?: { id?: string };
}

/**
 * Platform-wide user deletion (COMP-3).
 *
 * Lives in the retention module because deletion must run through the
 * assessment + pseudonymization pipeline rather than a raw row delete. Keeping
 * it here also keeps the module dependency one-way (retention -> users); wiring
 * the deletion service into UsersModule instead created a module cycle that
 * broke Nest's provider resolution at boot.
 *
 * Route is intentionally unchanged from its previous home in UsersController.
 */
@Controller()
export class MasterAdminUserDeletionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly userDeletion: IamUserDeletionService,
  ) {}

  @Delete('admin/users/:id')
  @UseGuards(RolesGuard, StepUpGuard, MasterAdminMfaGuard)
  @Roles('MASTER_ADMIN')
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_DELETION)
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  async adminDelete(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body?: { reason?: string },
  ) {
    const assessment = await this.userDeletion.assessGlobalDeletion(id);
    if (assessment.recommendedAction === 'BLOCKED') {
      throw new BadRequestException({
        code: 'USER_DELETION_BLOCKED',
        blockers: assessment.blockers,
      });
    }

    const actorId = req.user?.id;
    if (!actorId) {
      throw new BadRequestException('Authentication required');
    }

    if (assessment.recommendedAction === 'HARD_DELETE') {
      return this.usersService.delete(id);
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: id,
        status: { in: ['ACTIVE', 'INVITED', 'SUSPENDED'] },
      },
      select: { organizationId: true },
    });

    return this.userDeletion.pseudonymizeGlobalUser({
      userId: id,
      actorUserId: actorId,
      organizationId: membership?.organizationId ?? actorId,
      idempotencyKey: `master-admin-delete:${id}:${Date.now()}`,
      reason: body?.reason ?? 'Master admin user deletion',
    });
  }
}
