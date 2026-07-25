import { Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';

export type OperatorSensitiveDocumentKind =
  | 'CUSTOMER_ID_DOCUMENT'
  | 'GENERATED_BOOKING_DOCUMENT';

@Injectable()
export class OperatorDocumentAuditService {
  constructor(private readonly activityLog: ActivityLogService) {}

  async logSensitiveDocumentView(input: {
    organizationId: string;
    userId: string;
    kind: OperatorSensitiveDocumentKind;
    customerId?: string | null;
    bookingId?: string | null;
    documentId: string;
    documentType?: string | null;
    process?: string | null;
  }): Promise<void> {
    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId,
      action: ActivityAction.EXECUTE,
      entity: ActivityEntity.CUSTOMER,
      entityId: input.customerId ?? input.bookingId ?? input.documentId,
      description: `Operator sensitive document viewed (${input.kind})`,
      metaJson: {
        auditType: 'OPERATOR_SENSITIVE_DOCUMENT_VIEW',
        kind: input.kind,
        documentId: input.documentId,
        documentType: input.documentType ?? null,
        customerId: input.customerId ?? null,
        bookingId: input.bookingId ?? null,
        process: input.process ?? null,
      },
    });
  }
}
