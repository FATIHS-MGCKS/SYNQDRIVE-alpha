import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface VehicleWarningErasureRequest {
  organizationId: string;
  customerId?: string;
  userId?: string;
  dryRun?: boolean;
}

export interface VehicleWarningErasureReport {
  status: 'completed' | 'stub';
  organizationId: string;
  dryRun: boolean;
  redacted: {
    complaints: number;
    notifications: number;
  };
}

/**
 * GDPR erasure orchestrator for fleet warning PII (VW-F-042 / GDPR-W4).
 */
@Injectable()
export class VehicleWarningErasureService {
  private readonly logger = new Logger(VehicleWarningErasureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async eraseCustomerLinkedWarningData(
    request: VehicleWarningErasureRequest,
  ): Promise<VehicleWarningErasureReport> {
    const dryRun = request.dryRun ?? false;
    const report: VehicleWarningErasureReport = {
      status: 'completed',
      organizationId: request.organizationId,
      dryRun,
      redacted: { complaints: 0, notifications: 0 },
    };

    if (!request.customerId && !request.userId) {
      report.status = 'stub';
      return report;
    }

    const complaintWhere = {
      organizationId: request.organizationId,
      ...(request.customerId ? { customerId: request.customerId } : {}),
      ...(request.userId ? { createdByUserId: request.userId } : {}),
    };

    const complaints = await this.prisma.vehicleComplaint.findMany({
      where: complaintWhere,
      select: { id: true },
    });
    report.redacted.complaints = complaints.length;

    if (!dryRun && complaints.length > 0) {
      await this.prisma.vehicleComplaint.updateMany({
        where: { id: { in: complaints.map((c) => c.id) } },
        data: {
          customerId: null,
          driverId: null,
          notes: null,
          description: '[redacted]',
        },
      });
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        organizationId: request.organizationId,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      select: { id: true, templateParams: true },
      take: 1000,
    });

    const customerId = request.customerId;
    const toRedact = customerId
      ? notifications.filter((row) => {
          const params = row.templateParams as Record<string, unknown>;
          return params?.customerId === customerId;
        })
      : [];

    report.redacted.notifications = toRedact.length;

    if (!dryRun) {
      for (const row of toRedact) {
        const params = { ...(row.templateParams as Record<string, unknown>) };
        for (const key of [
          'customerId',
          'customerName',
          'customerEmail',
          'bookingId',
        ]) {
          if (key in params) params[key] = null;
        }
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { templateParams: params as Prisma.InputJsonValue },
        });
      }
    }

    this.logger.log(
      `Vehicle warning erasure org=${request.organizationId} dryRun=${dryRun} ${JSON.stringify(report.redacted)}`,
    );
    return report;
  }
}
