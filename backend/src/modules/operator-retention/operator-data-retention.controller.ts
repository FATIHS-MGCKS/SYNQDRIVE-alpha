import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { HandoverKind } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import operatorDataRetentionConfig from '@config/operator-data-retention.config';
import {
  RunOperatorDataRetentionDto,
  SetOperatorEvidenceLegalHoldDto,
} from './dto/operator-data-retention.dto';
import { OperatorDataRetentionService } from './operator-data-retention.service';
import { OperatorEvidenceLegalHoldService } from './operator-evidence-legal-hold.service';
import { OperatorHandoverDraftService } from './operator-handover-draft.service';

@Controller('organizations/:orgId/operator')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class OperatorDataRetentionController {
  constructor(
    private readonly retention: OperatorDataRetentionService,
    private readonly legalHold: OperatorEvidenceLegalHoldService,
    private readonly handoverDrafts: OperatorHandoverDraftService,
    @Inject(operatorDataRetentionConfig.KEY)
    private readonly config: ConfigType<typeof operatorDataRetentionConfig>,
  ) {}

  @Get('data-retention/config')
  @RequirePermission('bookings', 'read')
  getRetentionConfig(@Param('orgId') orgId: string) {
    return {
      organizationId: orgId,
      policyVersion: this.config.policyVersion,
      enabled: this.config.enabled,
      dryRunDefault: this.config.dryRun,
      handoverDraftTtlHours: this.config.handoverDraftTtlHours,
      days: this.config.days,
      backupNote: this.config.backup.note,
      legalConfirmationRequired: true,
    };
  }

  @Post('data-retention/runs')
  @RequirePermission('bookings', 'manage')
  runRetention(
    @Param('orgId') orgId: string,
    @Body() body: RunOperatorDataRetentionDto,
  ) {
    return this.retention.runOnce({
      trigger: 'manual',
      dryRun: body.dryRun,
      organizationId: orgId,
    });
  }

  @Get('bookings/:bookingId/evidence-legal-hold')
  @RequirePermission('bookings', 'read')
  async getEvidenceLegalHold(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    const row = await this.legalHold.get(orgId, bookingId);
    return {
      organizationId: orgId,
      bookingId,
      active: row?.active ?? false,
      reason: row?.reason ?? null,
      setAt: row?.setAt?.toISOString() ?? null,
      releasedAt: row?.releasedAt?.toISOString() ?? null,
    };
  }

  @Post('bookings/:bookingId/evidence-legal-hold')
  @RequirePermission('bookings', 'manage')
  async setEvidenceLegalHold(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SetOperatorEvidenceLegalHoldDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const row = await this.legalHold.setActive({
      organizationId: orgId,
      bookingId,
      reason: body.reason,
      setByUserId: userId ?? null,
    });
    return {
      organizationId: orgId,
      bookingId,
      active: row.active,
      reason: row.reason,
      setAt: row.setAt.toISOString(),
    };
  }

  @Delete('bookings/:bookingId/evidence-legal-hold')
  @RequirePermission('bookings', 'manage')
  async releaseEvidenceLegalHold(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const row = await this.legalHold.release(orgId, bookingId, userId ?? null);
    return {
      organizationId: orgId,
      bookingId,
      active: row.active,
      releasedAt: row.releasedAt?.toISOString() ?? null,
    };
  }

  @Get('bookings/:bookingId/handover-drafts/:kind')
  @RequirePermission('bookings', 'read')
  async getHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('kind') kind: HandoverKind,
  ) {
    const row = await this.handoverDrafts.find(orgId, bookingId, kind);
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      bookingId: row.bookingId,
      kind: row.kind,
      stepId: row.stepId,
      payload: row.payload,
      expiresAt: row.expiresAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @Put('bookings/:bookingId/handover-drafts/:kind')
  @RequirePermission('bookings', 'write')
  async upsertHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('kind') kind: HandoverKind,
    @Body() body: { stepId?: string | null; payload: Record<string, unknown> },
  ) {
    const row = await this.handoverDrafts.upsert({
      organizationId: orgId,
      bookingId,
      kind,
      stepId: body.stepId,
      payload: body.payload,
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      bookingId: row.bookingId,
      kind: row.kind,
      stepId: row.stepId,
      expiresAt: row.expiresAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @Delete('bookings/:bookingId/handover-drafts/:kind')
  @RequirePermission('bookings', 'write')
  deleteHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('kind') kind: HandoverKind,
  ) {
    return this.handoverDrafts.delete(orgId, bookingId, kind);
  }
}
