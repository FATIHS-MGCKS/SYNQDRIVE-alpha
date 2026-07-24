import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HmWebhookPayloadDto } from './dto/high-mobility.dto';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import { extractHmProviderVehicleReference } from './high-mobility-vehicle-reference.util';
import { ProviderGrantProvisioningService } from '@modules/data-authorizations/provider-grant-consolidation/provider-grant-provisioning.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';

export type HmAppContainerKey = 'healthApp' | 'telemetryApp';

@Injectable()
export class HighMobilityWebhookService {
  private readonly logger = new Logger(HighMobilityWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly hmSignalUsage: HmSignalUsageService,
    private readonly grantProvisioning: ProviderGrantProvisioningService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verify HMAC-SHA256 webhook signature for a specific app-container.
   *
   * Production behaviour (NODE_ENV=production):
   *   - If the app-container secret is not set, reject with UnauthorizedException.
   *   - If the secret is set but the header is missing or wrong, reject.
   *
   * Non-production behaviour:
   *   - If the secret is not configured, skip verification with a warning.
   *   - If the secret is configured, enforce as normal.
   */
  verifySignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    appContainer: HmAppContainerKey = 'healthApp',
  ): void {
    const secret = this.hmConfig[appContainer].webhookSecret;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!secret) {
      if (isProduction) {
        this.logger.error(`HM webhook [${appContainer}]: secret not configured in production — rejecting request`);
        throw new UnauthorizedException(`HM webhook verification not configured for ${appContainer}`);
      }
      this.logger.warn(`HM webhook [${appContainer}]: skipping signature check (secret not configured, non-production)`);
      return;
    }

    if (!signatureHeader) {
      throw new UnauthorizedException(`Missing HM webhook signature for ${appContainer}`);
    }

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException(`Invalid HM webhook signature for ${appContainer}`);
    }
  }

  async processWebhook(
    payload: HmWebhookPayloadDto,
    appContainer: HmAppContainerKey = 'healthApp',
  ): Promise<void> {
    const { event, vin, vehicleId, status } = payload;
    this.logger.log(`HM webhook [${appContainer}]: event=${event} vin=${vin} vehicleId=${vehicleId}`);

    // Scope search to the correct app-container type
    const containerFilter =
      appContainer === 'healthApp'
        ? { appContainerType: 'HM_HEALTH_APP' as any }
        : { appContainerType: 'HM_TELEMETRY_APP' as any };

    const hmRecord = await this.prisma.highMobilityVehicle.findFirst({
      where: {
        isActive: true,
        ...containerFilter,
        ...(vin ? { vin } : vehicleId ? { hmVehicleReference: vehicleId } : undefined),
      },
    });

    if (!hmRecord) {
      // Fallback: try without container filter for legacy rows lacking appContainerType
      const fallback = await this.prisma.highMobilityVehicle.findFirst({
        where: vin
          ? { vin, isActive: true }
          : vehicleId
            ? { hmVehicleReference: vehicleId, isActive: true }
            : undefined,
      });
      if (!fallback) {
        this.logger.warn(`HM webhook [${appContainer}]: no matching vehicle for vin=${vin} vehicleId=${vehicleId}`);
        return;
      }
      await this.handleWebhookEvent(fallback, event, vehicleId, appContainer, payload);
      return;
    }

    await this.handleWebhookEvent(hmRecord, event, vehicleId, appContainer, payload);
  }

  private async handleWebhookEvent(
    hmRecord: any,
    event: string | undefined,
    vehicleId: string | undefined,
    appContainer: HmAppContainerKey,
    payload: HmWebhookPayloadDto,
  ): Promise<void> {
    const oldStatus = hmRecord.clearanceStatus as string;

    switch (event?.toLowerCase()) {
      case 'fleet_clearance.approved':
      case 'vehicle.approved': {
        const providerVehicleReference = extractHmProviderVehicleReference(payload, hmRecord.vin);
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: {
            clearanceStatus: 'APPROVED' as any,
            clearanceApprovedAt: new Date(),
            clearanceLastCheckedAt: new Date(),
            ...(providerVehicleReference ? { hmVehicleReference: providerVehicleReference } : {}),
          },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_APPROVED', oldStatus, 'APPROVED', payload as any);
        this.logger.log(`HM vehicle ${hmRecord.vin} APPROVED via webhook [${appContainer}]`);

        // Record provider grant + legacy VPC when clearance is approved and vehicle is linked
        if (hmRecord.synqdriveVehicleId && hmRecord.organizationId) {
          const eventRef = vehicleId ?? event ?? `hm-${hmRecord.id}-${Date.now()}`;
          void this.grantProvisioning
            .provisionAndActivate({
              organizationId: hmRecord.organizationId,
              vehicleId: hmRecord.synqdriveVehicleId,
              provider: 'HIGH_MOBILITY',
              grantMechanism: 'WEBHOOK',
              scopes: ['health', 'tire_pressure', 'service_info'],
              providerGrantReference: vehicleId ?? null,
              providerAccountReference: hmRecord.hmVehicleReference ?? null,
              webhookEventId: eventRef,
              actorType: 'SYSTEM',
              legacyVpcMetadata: { event, appContainer, hmVehicleId: hmRecord.id },
              vpcGrantType: 'HM_FLEET_CLEARANCE',
            })
            .catch((e: Error) =>
              this.logger.error(
                `HM grant provisioning failed for vehicle ${hmRecord.synqdriveVehicleId}: ${e?.message}`,
              ),
            );
          void this.audit.record({
            action: ActivityAction.APPROVE,
            entity: ActivityEntity.PROVIDER_CONSENT,
            entityId: hmRecord.synqdriveVehicleId,
            description: `HM fleet clearance approved for vehicle ${hmRecord.vin} via ${appContainer}`,
            level: 'INFO',
          });
        }

        // Only trigger health signal poll for Health-APP approvals
        if (appContainer === 'healthApp') {
          void this.hmSignalUsage
            .refreshAllSignalGroupsIfHmHealthLinked(hmRecord.id)
            .catch((e: Error) =>
              this.logger.warn(`Post-approval signal poll failed (${hmRecord.vin}): ${e?.message}`),
            );
        }
        break;
      }
      case 'fleet_clearance.rejected':
      case 'vehicle.rejected': {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: { clearanceStatus: 'REJECTED' as any, clearanceLastCheckedAt: new Date() },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_REJECTED', oldStatus, 'REJECTED', payload as any);
        break;
      }
      case 'fleet_clearance.revoked':
      case 'vehicle.revoked': {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: { clearanceStatus: 'REVOKED' as any, clearanceLastCheckedAt: new Date() },
        });
        await this.writeHistory(hmRecord.id, 'WEBHOOK_REVOKED', oldStatus, 'REVOKED', payload as any);
        if (hmRecord.synqdriveVehicleId && hmRecord.organizationId) {
          void this.grantProvisioning
            .revokeForVehicle({
              organizationId: hmRecord.organizationId,
              vehicleId: hmRecord.synqdriveVehicleId,
              provider: 'HIGH_MOBILITY',
              reason: `HM fleet clearance revoked via webhook event: ${event}`,
            })
            .catch((e: Error) =>
              this.logger.error(
                `HM grant revoke failed for vehicle ${hmRecord.synqdriveVehicleId}: ${e?.message}`,
              ),
            );
        }
        break;
      }
      default:
        this.logger.warn(`HM webhook [${appContainer}]: unhandled event "${event}"`);
        await this.writeHistory(
          hmRecord.id,
          `WEBHOOK_${event?.toUpperCase() ?? 'UNKNOWN'}`,
          oldStatus,
          oldStatus,
          payload as any,
        );
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
        data: {
          highMobilityVehicleId: hmVehicleId,
          eventType,
          oldStatus,
          newStatus,
          payloadJson: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write webhook history: ${err?.message}`);
    }
  }
}
