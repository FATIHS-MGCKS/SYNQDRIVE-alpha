import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  DrivingDecisionAuditAction,
  DrivingDecisionRecommendation,
  DrivingDecisionSubjectType,
} from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DrivingDecisionsService } from './driving-decisions.service';

type CreateDrivingDecisionBody = {
  subjectType: DrivingDecisionSubjectType;
  subjectId: string;
  decision: DrivingDecisionAuditAction;
  recommendationAtDecision: DrivingDecisionRecommendation;
  dimensionsSnapshot: Record<string, unknown>;
  reason: string;
};

type RevokeDrivingDecisionBody = {
  revokeReason: string;
};

@Controller('organizations/:orgId/driving-decisions')
@UseGuards(OrgScopingGuard, RolesGuard)
export class DrivingDecisionsController {
  constructor(private readonly service: DrivingDecisionsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('subjectType') subjectType: DrivingDecisionSubjectType,
    @Query('subjectId') subjectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findBySubject(
      orgId,
      subjectType,
      subjectId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateDrivingDecisionBody,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('Authenticated user required');
    }

    return this.service.create({
      organizationId: orgId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      decision: body.decision,
      recommendationAtDecision: body.recommendationAtDecision,
      dimensionsSnapshot: body.dimensionsSnapshot,
      reason: body.reason,
      decidedByUserId: userId,
    });
  }

  @Post(':id/revoke')
  async revoke(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RevokeDrivingDecisionBody,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('Authenticated user required');
    }

    return this.service.revoke(orgId, id, userId, body.revokeReason);
  }
}
