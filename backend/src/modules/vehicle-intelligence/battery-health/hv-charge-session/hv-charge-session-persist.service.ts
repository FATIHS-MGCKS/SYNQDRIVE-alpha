import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { BatteryV2JobObservabilityService } from '../jobs/battery-v2-job-observability.service';
import { mapRechargeSegmentToHvChargeSessionDraft } from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import type {
  HvChargeSessionChangeKind,
  HvChargeSessionPersistResult,
} from './hv-charge-session.types';

@Injectable()
export class HvChargeSessionPersistService {
  private readonly logger = new Logger(HvChargeSessionPersistService.name);

  constructor(
    private readonly repository: HvChargeSessionRepository,
    private readonly observability: BatteryV2JobObservabilityService,
  ) {}

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
