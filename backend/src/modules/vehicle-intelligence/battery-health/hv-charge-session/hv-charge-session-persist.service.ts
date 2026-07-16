import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { BatteryV2JobObservabilityService } from '../jobs/battery-v2-job-observability.service';
import {
  buildFallbackSupersessionUpdate,
  findOverlappingFallbackSessions,
} from './hv-fallback-charge-session.supersede';
import { mapRechargeSegmentToHvChargeSessionDraft } from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import type {
  HvChargeSessionChangeKind,
  HvChargeSessionDraft,
  HvChargeSessionPersistResult,
} from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';

@Injectable()
export class HvChargeSessionPersistService {
  private readonly logger = new Logger(HvChargeSessionPersistService.name);

  constructor(
    private readonly repository: HvChargeSessionRepository,
    private readonly observability: BatteryV2JobObservabilityService,
  ) {}

  async persistSessionDraft(input: {
    organizationId: string;
    vehicleId: string;
    draft: HvChargeSessionDraft;
    correlationId?: string | null;
  }): Promise<HvChargeSessionPersistResult> {
    const reconciledAt = new Date();
    const draft = input.draft;

    const existing = await this.repository.findByFingerprint(
      input.vehicleId,
      draft.segmentFingerprint,
    );

    if (!existing) {
      const session = await this.repository.create(draft);
      this.recordStateChange({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey: draft.idempotencyKey,
        correlationId: input.correlationId ?? `hv-charge:create:${session.id}`,
        changeKind: 'created',
      });
      return {
        session,
        created: true,
        changed: true,
        changeKind: 'created',
      };
    }

    const merged = mergeHvChargeSessionUpdate({
      existing,
      incoming: draft,
      reconciledAt,
    });

    if (!merged.changed || !merged.update) {
      const session =
        (await this.repository.findById(existing.id)) ??
        (existing as HvChargeSessionPersistResult['session']);
      return {
        session,
        created: false,
        changed: false,
        changeKind: 'no_op',
      };
    }

    const session = await this.repository.update(existing.id, merged.update);
    this.recordStateChange({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey: draft.idempotencyKey,
      correlationId:
        input.correlationId ?? `hv-charge:${merged.changeKind}:${session.id}`,
      changeKind: merged.changeKind,
    });

    this.logger.debug(
      `HV charge session updated vehicle=${input.vehicleId} fingerprint=${draft.segmentFingerprint} change=${merged.changeKind}`,
    );

    return {
      session,
      created: false,
      changed: true,
      changeKind: merged.changeKind,
    };
  }

  async persistRechargeSegment(input: {
    organizationId: string;
    vehicleId: string;
    segment: NormalizedDimoRechargeSegment;
    correlationId?: string | null;
  }): Promise<HvChargeSessionPersistResult> {
    const reconciledAt = new Date();
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segment: input.segment,
      reconciledAt,
    });

    await this.supersedeOverlappingFallbackSessions({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segment: input.segment,
      reconciledAt,
      correlationId: input.correlationId,
    });

    return this.persistSessionDraft({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draft,
      correlationId: input.correlationId,
    });
  }

  private async supersedeOverlappingFallbackSessions(input: {
    organizationId: string;
    vehicleId: string;
    segment: NormalizedDimoRechargeSegment;
    reconciledAt: Date;
    correlationId?: string | null;
  }): Promise<void> {
    const fallbackSessions = await this.repository.findBySource(
      input.vehicleId,
      HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    );
    const overlapping = findOverlappingFallbackSessions(
      fallbackSessions,
      new Date(input.segment.startAt),
      input.segment.endAt ? new Date(input.segment.endAt) : null,
    );

    for (const fallback of overlapping) {
      if (fallback.metadata && typeof fallback.metadata === 'object') {
        const meta = fallback.metadata as { supersededBySegmentFingerprint?: string };
        if (meta.supersededBySegmentFingerprint) continue;
      }

      const update = buildFallbackSupersessionUpdate({
        existing: fallback,
        dimoSegment: input.segment,
        reconciledAt: input.reconciledAt,
      });
      const session = await this.repository.update(fallback.id, update);
      this.recordStateChange({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey: fallback.idempotencyKey,
        correlationId:
          input.correlationId ?? `hv-charge:superseded:${session.id}`,
        changeKind: 'superseded',
      });
    }
  }

  private recordStateChange(input: {
    organizationId: string;
    vehicleId: string;
    idempotencyKey: string;
    correlationId: string;
    changeKind: HvChargeSessionChangeKind;
  }): void {
    if (input.changeKind === 'no_op') return;

    this.observability.log({
      jobType: 'HV_RECHARGE_SESSION_RECONCILE',
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      operation: `hv_charge_session.${input.changeKind}`,
    });
  }
}
