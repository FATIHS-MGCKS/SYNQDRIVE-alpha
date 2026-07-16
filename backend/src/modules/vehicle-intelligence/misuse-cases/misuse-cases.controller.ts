import { Controller, Get, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { MisuseCasesService, ListMisuseCasesQuery } from './misuse-cases.service';
import { MisuseCaseLifecycleService } from './misuse-case-lifecycle/misuse-case-lifecycle.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';

type MisuseCaseTransitionBody = {
  action: 'CONFIRM' | 'DISMISS' | 'RESOLVE' | 'DOWNGRADE' | 'SUPERSEDE';
  resolutionReason?: string;
  operatorNote?: string;
};

@Controller('organizations/:orgId/misuse-cases')
@UseGuards(OrgScopingGuard, RolesGuard)
export class MisuseCasesController {
  constructor(
    private readonly misuseCasesService: MisuseCasesService,
    private readonly lifecycleService: MisuseCaseLifecycleService,
  ) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query() query: ListMisuseCasesQuery,
  ) {
    return this.misuseCasesService.list(orgId, query);
  }

  @Get(':id')
  async getOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.misuseCasesService.getById(orgId, id);
  }

  @Post(':id/lifecycle')
  async transition(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: MisuseCaseTransitionBody,
  ) {
    const row = await this.lifecycleService.transition(orgId, id, body.action, {
      resolutionReason: body.resolutionReason,
      operatorNote: body.operatorNote,
    });
    return this.misuseCasesService.getById(orgId, row.id);
  }
}
