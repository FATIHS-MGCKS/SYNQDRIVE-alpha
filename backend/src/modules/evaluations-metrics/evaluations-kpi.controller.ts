import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { EvaluationsFinancialKpiService } from './evaluations-financial-kpi.service';

@Controller('organizations/:orgId/evaluations/kpis')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsKpiController {
  constructor(private readonly financialKpiService: EvaluationsFinancialKpiService) {}

  /**
   * Primary financial MTD KPI bundle for Auswertungen (unified metric response contract).
   */
  @Get('financial-mtd')
  async getFinancialMtd(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId?: string,
    @Query('reference') reference?: string,
  ) {
    const ref = reference ? new Date(reference) : undefined;
    return this.financialKpiService.getFinancialMtdBundle({
      organizationId: orgId,
      stationId: stationId?.trim() || undefined,
      reference: ref && !Number.isNaN(ref.getTime()) ? ref : undefined,
    });
  }
}
