import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  CreateRecommendationDto,
  ListRecommendationsQueryDto,
  TransitionRecommendationStatusDto,
  UpdateRecommendationDto,
} from './dto/recommendation.dto';
import { OrgRecommendationsService } from './org-recommendations.service';

interface RecommendationAuthRequest extends Request {
  user?: { id?: string };
}

@Controller('organizations/:orgId/evaluations/recommendations')
@UseGuards(OrgScopingGuard, RolesGuard)
export class OrgRecommendationsController {
  constructor(private readonly recommendations: OrgRecommendationsService) {}

  @Get()
  async list(@Param('orgId') orgId: string, @Query() query: ListRecommendationsQueryDto) {
    return this.recommendations.list(orgId, {
      status: query.status,
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      ownerId: query.ownerId,
      limit: query.limit,
    });
  }

  @Get(':recommendationId')
  async getOne(
    @Param('orgId') orgId: string,
    @Param('recommendationId') recommendationId: string,
  ) {
    return this.recommendations.getById(orgId, recommendationId);
  }

  @Get(':recommendationId/events')
  async getEvents(
    @Param('orgId') orgId: string,
    @Param('recommendationId') recommendationId: string,
  ) {
    return this.recommendations.getEvents(orgId, recommendationId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('tasks', 'write')
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateRecommendationDto,
    @Req() req: RecommendationAuthRequest,
  ) {
    return this.recommendations.create(
      orgId,
      {
        organizationId: orgId,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        category: body.category,
        title: body.title,
        description: body.description,
        rationale: body.rationale,
        expectedBenefit: body.expectedBenefit,
        estimatedCost: body.estimatedCost,
        expectedNetBenefit: body.expectedNetBenefit,
        confidence: body.confidence,
        priority: body.priority,
        affectedEntities: body.affectedEntities,
        ownerId: body.ownerId,
        dueAt: body.dueAt,
        calculationVersion: body.calculationVersion,
      },
      req.user?.id ?? null,
    );
  }

  @Patch(':recommendationId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('tasks', 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: UpdateRecommendationDto,
    @Req() req: RecommendationAuthRequest,
  ) {
    return this.recommendations.update(orgId, recommendationId, body, req.user?.id ?? null);
  }

  @Post(':recommendationId/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('tasks', 'write')
  async transitionStatus(
    @Param('orgId') orgId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: TransitionRecommendationStatusDto,
    @Req() req: RecommendationAuthRequest,
  ) {
    return this.recommendations.transitionStatus(
      orgId,
      recommendationId,
      body.status,
      req.user?.id ?? null,
      body.reason,
    );
  }
}
