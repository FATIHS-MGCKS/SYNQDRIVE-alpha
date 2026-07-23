import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_AUTH_MODULE } from '../../data-authorization.constants';
import {
  CreateLegalBasisAssessmentDto,
  ListLegalBasisAssessmentsQueryDto,
  RejectLegalBasisAssessmentDto,
  UpdateLegalBasisAssessmentDto,
} from './dto';
import { LegalBasisAssessmentService } from './legal-basis-assessment.service';

interface AuthedRequest {
  user?: { id?: string };
}

@Controller('organizations/:orgId/processing-activities/:activityId/legal-basis-assessments')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class LegalBasisAssessmentController {
  constructor(private readonly service: LegalBasisAssessmentService) {}

  @Get()
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  list(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Query() query: ListLegalBasisAssessmentsQueryDto,
  ) {
    return this.service.listByActivity(orgId, activityId, query);
  }

  @Get(':assessmentId')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  get(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.service.findById(orgId, assessmentId);
  }

  @Post()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() body: CreateLegalBasisAssessmentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.create(orgId, activityId, body, req.user?.id);
  }

  @Patch(':assessmentId')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  update(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
    @Body() body: UpdateLegalBasisAssessmentDto,
  ) {
    return this.service.update(orgId, assessmentId, body);
  }

  @Post(':assessmentId/submit')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  submit(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.submitForReview(orgId, assessmentId, req.user.id);
  }

  @Post(':assessmentId/approve')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  approve(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.approve(orgId, assessmentId, req.user.id);
  }

  @Post(':assessmentId/reject')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  reject(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
    @Body() body: RejectLegalBasisAssessmentDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.reject(orgId, assessmentId, req.user.id, body);
  }

  @Post(':assessmentId/new-version')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  createVersion(
    @Param('orgId') orgId: string,
    @Param('assessmentId') assessmentId: string,
    @Body() body: CreateLegalBasisAssessmentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.createNewVersion(orgId, assessmentId, body, req.user?.id);
  }
}
