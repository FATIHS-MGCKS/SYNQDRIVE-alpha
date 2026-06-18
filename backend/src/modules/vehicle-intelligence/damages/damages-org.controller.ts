import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DamagesService } from './damages.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('organizations/:orgId/damages')
@UseGuards(OrgScopingGuard, RolesGuard)
export class DamagesOrgController {
  constructor(private readonly damagesService: DamagesService) {}

  @Get('stats')
  getFleetStats(@Param('orgId') orgId: string) {
    return this.damagesService.getFleetStats(orgId);
  }
}
