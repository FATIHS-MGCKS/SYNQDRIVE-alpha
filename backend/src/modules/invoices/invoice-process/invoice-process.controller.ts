import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  OrgInvoiceProcessStatus,
} from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import { InvoiceProcessProcessorService } from './invoice-process-processor.service';
import { InvoiceProcessReconciliationService } from './invoice-process-reconciliation.service';
import { InvoiceProcessRepository } from './invoice-process.repository';

@Controller()
export class InvoiceProcessController {
  constructor(
    private readonly repo: InvoiceProcessRepository,
    private readonly outbox: InvoiceProcessOutboxService,
    private readonly processor: InvoiceProcessProcessorService,
    private readonly reconciliation: InvoiceProcessReconciliationService,
  ) {}

  @Get('organizations/:orgId/invoice-processes')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN')
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: OrgInvoiceProcessStatus,
    @Query('entityId') entityId?: string,
  ) {
    const rows = await this.repo.listByOrg(orgId, { status, entityId });
    return rows.map((row) => this.outbox.toDto(row));
  }

  @Get('organizations/:orgId/invoice-processes/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    const row = await this.repo.findById(id, orgId);
    if (!row) throw new NotFoundException('Process not found');
    return this.outbox.toDto(row);
  }

  @Post('organizations/:orgId/invoice-processes/:id/retry')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN')
  async manualRetry(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const row = await this.repo.findById(id, orgId);
    if (!row) throw new NotFoundException('Process not found');

    const reset = await this.repo.resetForManualRetry(id, userId ?? null);
    const outcome = await this.processor.processById(reset.id, orgId);
    const latest = await this.repo.findById(id, orgId);
    return {
      process: latest ? this.outbox.toDto(latest) : null,
      outcome,
    };
  }

  @Post('organizations/:orgId/invoice-processes/reconcile')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN')
  async reconcileOrg(@Param('orgId') orgId: string) {
    return this.reconciliation.runForOrganization(orgId);
  }
}
