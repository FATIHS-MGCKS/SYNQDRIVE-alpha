import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  CreateDataSubjectConsentDto,
  GrantDataSubjectConsentDto,
  WithdrawDataSubjectConsentDto,
} from './dto/data-subject-consent.dto';
import { DataSubjectConsentService } from './data-subject-consent.service';

interface AuthedRequest {
  user?: { id?: string };
}

@Controller('organizations/:orgId/processing-activities/:activityId/data-subject-consents')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataSubjectConsentController {
  constructor(private readonly service: DataSubjectConsentService) {}

  @Get()
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  list(@Param('orgId') orgId: string, @Param('activityId') activityId: string) {
    return this.service.listByActivity(orgId, activityId);
  }

  @Get(':consentId')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  get(@Param('orgId') orgId: string, @Param('consentId') consentId: string) {
    return this.service.findById(orgId, consentId);
  }

  @Post()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() body: CreateDataSubjectConsentDto,
  ) {
    return this.service.create(orgId, activityId, body);
  }

  @Post(':consentId/grant')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  grant(
    @Param('orgId') orgId: string,
    @Param('consentId') consentId: string,
    @Body() body: GrantDataSubjectConsentDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.grant(orgId, consentId, body, req.user.id);
  }

  @Post(':consentId/withdraw')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  withdraw(
    @Param('orgId') orgId: string,
    @Param('consentId') consentId: string,
    @Body() body: WithdrawDataSubjectConsentDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.withdraw(orgId, consentId, body, req.user.id);
  }
}
