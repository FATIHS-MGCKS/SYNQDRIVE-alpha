import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_AUTH_MODULE } from '../../data-authorization.constants';
import { ReplaceEnforcementPolicyScopesDto } from './dto/enforcement-policy-scope.dto';
import { EnforcementPolicyScopeService } from './enforcement-policy-scope.service';

@Controller('organizations/:orgId/enforcement-policies/:policyId/scopes')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class EnforcementPolicyScopeController {
  constructor(private readonly service: EnforcementPolicyScopeService) {}

  @Get()
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  get(@Param('orgId') orgId: string, @Param('policyId') policyId: string) {
    return this.service.getScopes(orgId, policyId);
  }

  @Put()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  replace(
    @Param('orgId') orgId: string,
    @Param('policyId') policyId: string,
    @Body() body: ReplaceEnforcementPolicyScopesDto,
  ) {
    return this.service.replaceScopes(orgId, policyId, body);
  }

  @Post('new-version')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  createVersion(
    @Param('orgId') orgId: string,
    @Param('policyId') policyId: string,
    @Body() body: ReplaceEnforcementPolicyScopesDto,
  ) {
    return this.service.createScopedVersion(orgId, policyId, body);
  }
}
