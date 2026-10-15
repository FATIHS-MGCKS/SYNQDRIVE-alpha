import { Injectable, Logger } from '@nestjs/common';
import { VsiProfileLifecycleOutboxEventType } from '@prisma/client';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE,
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED,
  VSI_PROFILE_LIFECYCLE_OUTBOX_BATCH_SIZE,
  VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS,
} from './vsi-profile-lifecycle.constants';
import type { VsiProfileLifecycleOutboxPayloadV1 } from './vsi-profile-lifecycle.types';
import { planActiveVehicleProfileBackfill } from './vsi-profile-lifecycle.backfill';

export type VsiProfileLifecycleProcessOutcome =
  | 'completed'
  | 'retry'
  | 'failed'
  | 'skipped';

@Injectable()
export class VsiProfileLifecycleOutboxProcessor {
  private readonly logger = new Logger(VsiProfileLifecycleOutboxProcessor.name);

  constructor(
    private readonly repository: VsiProfileLifecycleOutboxRepository,
    private readonly materialization: VsiSignalProfileMaterializationService,
  ) {}

  async processPendingBatch(
    limit = VSI_PROFILE_LIFECYCLE_OUTBOX_BATCH_SIZE,
  ): Promise<Array<{ outboxId: string; outcome: VsiProfileLifecycleProcessOutcome }>> {
    const rows = await this.repository.claimPendingBatch(limit, 'vsi-profile-lifecycle');
    const results: Array<{ outboxId: string; outcome: VsiProfileLifecycleProcessOutcome }> = [];
    for (const row of rows) {
      results.push({ outboxId: row.id, outcome: await this.processRow(row) });
    }
    return results;
  }

  private async processRow(
    row: {
      id: string;
      eventType: VsiProfileLifecycleOutboxEventType;
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string | null;
      payload: unknown;
      attempts: number;
    },
  ): Promise<VsiProfileLifecycleProcessOutcome> {
    try {
      const payload = row.payload as VsiProfileLifecycleOutboxPayloadV1;
      switch (row.eventType) {
        case 'SOURCE_LINK_ACTIVATED':
          await this.handleSourceLinkActivated(row, payload);
          break;
        case 'SOURCE_LINK_DEACTIVATED':
          await this.handleSourceLinkDeactivated(row, payload, false);
          break;
        case 'SOURCE_LINK_SUPERSEDED':
          await this.handleSourceLinkDeactivated(row, payload, true);
          break;
        case 'DECLARED_CATALOG_ADVANCED':
          await this.handleCatalogAdvanced(row, payload);
          break;
        case 'ACTIVE_VEHICLE_BACKFILL_RECONCILE':
          await this.handleBackfillBatch(row, payload);
          break;
        default:
          this.logger.warn(`VSI lifecycle unknown event type=${row.eventType}`);
          return 'skipped';
      }
      await this.repository.markCompleted(row.id);
      return 'completed';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'vsi_lifecycle_handler_failed';
      this.logger.warn(
        `VSI lifecycle outbox failed id=${row.id} type=${row.eventType} attempts=${row.attempts}: ${message}`,
      );
      if (row.attempts >= VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS) {
        await this.repository.markFailed(row.id, message);
        return 'failed';
      }
      const backoffMs = Math.min(60_000, 2_000 * row.attempts);
      await this.repository.markRetry(row.id, message, backoffMs);
      return 'retry';
    }
  }

  private async handleSourceLinkActivated(
    row: { organizationId: string; vehicleId: string; providerSourceLinkId: string | null },
    payload: VsiProfileLifecycleOutboxPayloadV1,
  ): Promise<void> {
    const linkId = row.providerSourceLinkId ?? payload.providerSourceLinkId;
    if (!linkId) {
      return;
    }
    await this.materialization.materializeFromPersistedEvidence({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      providerSourceLinkId: linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });
  }

  private async handleSourceLinkDeactivated(
    row: { organizationId: string; vehicleId: string; providerSourceLinkId: string | null },
    payload: VsiProfileLifecycleOutboxPayloadV1,
    superseded: boolean,
  ): Promise<void> {
    const linkId = row.providerSourceLinkId ?? payload.providerSourceLinkId;
    if (!linkId) {
      return;
    }
    const limitation = superseded
      ? VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED
      : VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE;
    await this.materialization.appendLifecycleLimitations({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      providerSourceLinkId: linkId,
      limitations: [limitation],
      reason: payload.reason ?? (superseded ? 'SOURCE_LINK_SUPERSEDED' : 'SOURCE_LINK_DEACTIVATED'),
    });
  }

  private async handleCatalogAdvanced(
    row: { organizationId: string; vehicleId: string; providerSourceLinkId: string | null },
    payload: VsiProfileLifecycleOutboxPayloadV1,
  ): Promise<void> {
    const linkId = row.providerSourceLinkId ?? payload.providerSourceLinkId;
    if (!linkId) {
      const activeLinks = await this.materialization.listActiveProviderLinksForVehicle(
        row.organizationId,
        row.vehicleId,
      );
      for (const active of activeLinks) {
        await this.materialization.materializeFromPersistedEvidence({
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          providerSourceLinkId: active.id,
          lifecycleMode: 'DECLARED_CATALOG_ADVANCED',
        });
      }
      return;
    }
    await this.materialization.materializeFromPersistedEvidence({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      providerSourceLinkId: linkId,
      lifecycleMode: 'DECLARED_CATALOG_ADVANCED',
    });
  }

  private async handleBackfillBatch(
    row: { organizationId: string },
    payload: VsiProfileLifecycleOutboxPayloadV1,
  ): Promise<void> {
    await planActiveVehicleProfileBackfill({
      organizationId: row.organizationId,
      materialization: this.materialization,
      cursor: payload.backfillCursor ?? null,
    });
  }
}
