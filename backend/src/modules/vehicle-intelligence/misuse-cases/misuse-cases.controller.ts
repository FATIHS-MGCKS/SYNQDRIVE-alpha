import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MisuseCasesService, ListMisuseCasesQuery } from './misuse-cases.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('organizations/:orgId/misuse-cases')
@UseGuards(OrgScopingGuard, RolesGuard)
export class MisuseCasesController {
  constructor(private readonly misuseCasesService: MisuseCasesService) {}

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
}
