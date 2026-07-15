import { Injectable } from '@nestjs/common';
import { BillingDomainEventOutboxDeliveryStatus } from '@prisma/client';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import { BillingEmailDeliveryAuditService } from './email/billing-email-delivery-audit.service';
import {
  TenantBillingEmailHistoryItemDto,
  TenantBillingEmailHistoryQueryDto,
} from './dto/tenant-billing-history.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import { maskEmailRecipient, resolveBillingEmailEventLabel } from './tenant-billing.mapper';

@Injectable()
export class TenantBillingEmailHistoryService {
  constructor(private readonly audit: BillingEmailDeliveryAuditService) {}

  async listEmailHistory(
    organizationId: string,
    query: TenantBillingEmailHistoryQueryDto = {},
  ): Promise<PaginatedResult<TenantBillingEmailHistoryItemDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'sentAt',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantBillingEmailHistoryQueryDto.ALLOWED_SORT_FIELDS,
    });

    const result = await this.audit.listDeliveries({
      organizationId,
      status: query.status as BillingDomainEventOutboxDeliveryStatus | undefined,
      page: parsed.page,
      limit: parsed.limit,
    });

    let items = result.data.map((row) => this.mapRow(row));

    if (parsed.search) {
      const needle = parsed.search.toLowerCase();
      items = items.filter((item) =>
        [item.eventTypeLabel, item.statusLabel, item.recipientMasked]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    return buildPaginatedResult(items, result.meta.total, {
      page: parsed.page,
      limit: parsed.limit,
    });
  }

  private mapRow(row: {
    deliveryId: string;
    eventType: string;
    deliveryStatus: string;
    deliveryState: string;
    updatedAt: string;
    recipientEmail: string | null;
  }): TenantBillingEmailHistoryItemDto {
    return {
      id: row.deliveryId,
      sentAt: row.updatedAt,
      eventTypeLabel: resolveBillingEmailEventLabel(row.eventType),
      statusLabel: row.deliveryState || row.deliveryStatus,
      recipientMasked: maskEmailRecipient(row.recipientEmail),
      invoiceNumberLabel: null,
    };
  }
}
