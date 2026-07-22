import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IamDataCategory } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { PrismaService } from '@shared/database/prisma.service';
import { IamDataRetentionWorkerService } from './iam-data-retention-worker.service';
import { IamDsarExportService } from './iam-dsar-export.service';
import { IamLegalHoldService } from './iam-legal-hold.service';
import { IamUserDeletionService } from './iam-user-deletion.service';
import { IAM_DATA_CATEGORY_DEFINITIONS } from './iam-data-retention.contract';
import { resolveRetentionPolicies } from './iam-data-retention.policy';

interface AuthedRequest {
  user?: { id?: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/iam/data-retention')
@UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
export class IamDataRetentionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: IamDataRetentionWorkerService,
    private readonly legalHold: IamLegalHoldService,
    private readonly dsar: IamDsarExportService,
    private readonly userDeletion: IamUserDeletionService,
  ) {}

  private actor(req: AuthedRequest) {
    return {
      route: undefined as string | undefined,
      ipAddress: req.ip,
      userAgent: Array.isArray(req.headers?.['user-agent'])
        ? req.headers?.['user-agent'][0]
        : req.headers?.['user-agent'],
    };
  }

  @Get('categories')
  @RequirePermission(USERS_MODULE, 'read')
  listCategories() {
    return IAM_DATA_CATEGORY_DEFINITIONS;
  }

  @Get('policies')
  @RequirePermission(USERS_MODULE, 'read')
  async listPolicies(@Param('orgId') orgId: string) {
    return resolveRetentionPolicies(this.prisma, orgId);
  }

  @Post('runs')
  @RequirePermission(USERS_MODULE, 'manage')
  async runRetention(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() body: { dryRun?: boolean; categories?: IamDataCategory[] },
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.worker.run({
      organizationId: orgId,
      dryRun: body.dryRun,
      categories: body.categories,
      actorUserId: actorId,
      trigger: 'api',
    });
  }

  @Post('legal-holds')
  @RequirePermission(USERS_MODULE, 'manage')
  async placeLegalHold(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body()
    body: {
      subjectUserId?: string;
      category?: IamDataCategory;
      reason: string;
      reference?: string;
    },
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.legalHold.placeHold({
      organizationId: orgId,
      userId: body.subjectUserId,
      category: body.category,
      reason: body.reason,
      placedByUserId: actorId,
      metadata: body.reference ? { reference: body.reference } : undefined,
      actor: this.actor(req),
    });
  }

  @Delete('legal-holds/:holdId')
  @RequirePermission(USERS_MODULE, 'manage')
  async releaseLegalHold(
    @Param('orgId') orgId: string,
    @Param('holdId') holdId: string,
    @Req() req: AuthedRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.legalHold.releaseHold({
      holdId,
      organizationId: orgId,
      releasedByUserId: actorId,
      actor: this.actor(req),
    });
  }

  @Get('legal-holds')
  @RequirePermission(USERS_MODULE, 'read')
  async listLegalHolds(@Param('orgId') orgId: string) {
    return this.legalHold.listActiveHolds(orgId);
  }

  @Get('dsar/export/:userId')
  @RequirePermission(USERS_MODULE, 'read')
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_EXPORT)
  async exportUserData(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Query('idempotencyKey') idempotencyKey?: string,
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.dsar.exportUserData({
      organizationId: orgId,
      subjectUserId: userId,
      requestedByUserId: actorId,
      idempotencyKey: idempotencyKey ?? `dsar:${orgId}:${userId}:${Date.now()}`,
      actor: this.actor(req),
    });
  }

  @Get('users/:userId/deletion-assessment')
  @RequirePermission(USERS_MODULE, 'manage')
  async assessDeletion(@Param('userId') userId: string) {
    return this.userDeletion.assessGlobalDeletion(userId);
  }

  @Post('users/:userId/delete')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_EXPORT)
  async deleteUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: { idempotencyKey: string; reason: string },
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.userDeletion.pseudonymizeGlobalUser({
      userId,
      actorUserId: actorId,
      organizationId: orgId,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
    });
  }
}
