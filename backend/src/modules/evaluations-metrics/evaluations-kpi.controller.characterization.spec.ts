import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { EvaluationsKpiController } from './evaluations-kpi.controller';
import { EvaluationsFinancialKpiService } from './evaluations-financial-kpi.service';

describe('EvaluationsKpiController contract characterization', () => {
  it('applies OrgScopingGuard and RolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, EvaluationsKpiController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
  });

  it('routes financial-mtd under evaluations/kpis path', () => {
    const apiSource = readFileSync(
      join(__dirname, '../../../../frontend/src/lib/api.ts'),
      'utf8',
    );
    expect(apiSource).toContain('/evaluations/kpis/financial-mtd');
    expect(apiSource).toContain('financialMtd');
  });

  it('delegates to EvaluationsFinancialKpiService.getFinancialMtdBundle', async () => {
    const mockBundle = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      timezone: { effective: 'Europe/Berlin', organization: 'Europe/Berlin', station: null, source: 'organization' },
      periods: null,
      metrics: [],
      receivablesAnalytics: null,
      revenueCashflowContribution: null,
      multiCurrency: null,
    };
    const service = {
      getFinancialMtdBundle: jest.fn().mockResolvedValue(mockBundle),
    };
    const controller = new EvaluationsKpiController(
      service as unknown as EvaluationsFinancialKpiService,
    );
    const result = await controller.getFinancialMtd('org-1', undefined, '2026-06-16T12:00:00.000Z');
    expect(service.getFinancialMtdBundle).toHaveBeenCalledWith({
      organizationId: 'org-1',
      stationId: undefined,
      reference: expect.any(Date),
    });
    expect(result).toBe(mockBundle);
  });
});
