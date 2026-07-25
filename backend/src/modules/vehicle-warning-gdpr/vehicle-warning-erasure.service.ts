import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface VehicleWarningErasureRequest {
  organizationId: string;
  customerId?: string;
  userId?: string;
  dryRun?: boolean;
}

export interface VehicleWarningErasureReport {
  status: 'stub';
  organizationId: string;
  dryRun: boolean;
  message: string;
}

/**
 * Stub erasure orchestrator for fleet warning PII (VW-F-042 / GDPR-W4).
 * Will null/anonymize customer-linked fields on complaints, insights, and notifications
 * while preserving vehicle-technical finding history.
 */
@Injectable()
export class VehicleWarningErasureService {
  private readonly logger = new Logger(VehicleWarningErasureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async eraseCustomerLinkedWarningData(
    request: VehicleWarningErasureRequest,
  ): Promise<VehicleWarningErasureReport> {
    void this.prisma;
    this.logger.warn(
      `Vehicle warning erasure stub invoked for org=${request.organizationId} ` +
        `(dryRun=${request.dryRun ?? true}) — no mutations performed`,
    );
    return {
      status: 'stub',
      organizationId: request.organizationId,
      dryRun: request.dryRun ?? true,
      message:
        'Erasure orchestrator not yet implemented. Wire complaint/insight/notification redaction in WP-16.',
    };
  }
}
