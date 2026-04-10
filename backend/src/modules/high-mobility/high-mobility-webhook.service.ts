import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HmWebhookPayloadDto } from './dto/high-mobility.dto';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';

@Injectable()
export class HighMobilityWebhookService {
  private readonly logger = new Logger(HighMobilityWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly hmSignalUsage: HmSignalUsageService,
  ) {}

  private get webhookSecret(): string {
    return (this.configService.get('highMobility') as any).webhookSecret ?? '';
  }

  /** Verify HMAC-SHA256 webhook signature if secret is configured */
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): void {
    const secret = this.webhookSecret;
    if (!secret) return; // Skip if not configured

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing HM webhook signature');
    }

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))) {
      throw new UnauthorizedException('Invalid HM webhook signature');
    }
  }

  async processWebhook(payload: HmWebhookPayloadDto): Promise<void> {
    const { event, vin, vehicleId, status } = payload;
    this.logger.log(`HM webhook received: event=${event} vin=${vin} vehicleId=${vehicleId}`);

    // Find matching HM vehicle record by VIN or HM reference
    const hmRecord = await this.prisma.highMobilityVehicle.findFirst({
      where: vin
        ? { vin, isActive: true }
        : vehicleId
          ? { hmVehicleReference: vehicleId, isActive: true }
          : undefined,
    });

    if (!hmRecord) {
      this.logger.warn(`HM webhook: no matching vehicle for vin=${vin} vehicleId=${vehicleId}`);
      return;
    }

    const oldStatus = hmRecord.clearanceStatus as string;

    switch (event?.toLowerCase()) {
      case 'fleet_clearance.approved':
      case 'vehicle.approved': {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: {
            clearanceStatus: 'APPROVED' as any,
            clearanceApprovedAt: new Date(),
            clearanceLastCheckedAt: new Date(),
            ...(vehicleId && !hmRecord.hmVehicleReference ? { hmVehicleReference: vehicleId } : {}),
          },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_APPROVED', oldStatus, 'APPROVED', payload as any);
        this.logger.log(`HM vehicle ${hmRecord.vin} APPROVED via webhook`);
        // If HM Health is already linked to a SynqDrive vehicle, poll signals immediately
        void this.hmSignalUsage.refreshAllSignalGroupsIfHmHealthLinked(hmRecord.id).catch((e: Error) =>
          this.logger.warn(`Post-approval HM signal poll failed (${hmRecord.vin}): ${e?.message}`),
        );
        break;
      }
      case 'fleet_clearance.rejected':
      case 'vehicle.rejected': {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: { clearanceStatus: 'REJECTED' as any, clearanceLastCheckedAt: new Date() },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_REJECTED', oldStatus, 'REJECTED', payload as any);
        this.logger.log(`HM vehicle ${hmRecord.vin} REJECTED via webhook`);
        break;
      }
      case 'fleet_clearance.revoked':
      case 'vehicle.revoked': {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: { clearanceStatus: 'REVOKED' as any, clearanceLastCheckedAt: new Date() },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_REVOKED', oldStatus, 'REVOKED', payload as any);
        break;
      }
      default:
        this.logger.warn(`HM webhook: unhandled event type "${event}"`);
        await this.writeHistory(hmRecord.id, `WEBHOOK_${event?.toUpperCase() ?? 'UNKNOWN'}`, oldStatus, oldStatus, payload as any);
    }
  }

  private async writeHistory(
    hmVehicleId: string,
    eventType: string,
    oldStatus: string | null,
    newStatus: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.highMobilityStatusHistory.create({
        data: { highMobilityVehicleId: hmVehicleId, eventType, oldStatus, newStatus, payloadJson: payload as Prisma.InputJsonValue },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write webhook history: ${err?.message}`);
    }
  }
}
