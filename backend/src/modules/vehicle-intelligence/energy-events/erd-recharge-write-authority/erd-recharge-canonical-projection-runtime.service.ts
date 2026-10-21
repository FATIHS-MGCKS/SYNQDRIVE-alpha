import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionPersistResult } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { projectCanonicalRecharge } from '../erd-recharge-projection/erd-canonical-recharge-projector';
import { ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME } from '../erd-recharge-projection/erd-canonical-recharge-projector.types';
import { evaluateErdRechargeWriteAuthority } from './erd-recharge-write-authority.policy';
import {
  ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME,
  type ErdRechargeProjectionRuntimeOutcome,
} from './erd-recharge-write-authority.constants';
import { shouldProjectCanonicalRechargeSession } from './erd-recharge-write-gate.policy';
import { ErdRechargeWriteAuthorityMetricsService } from './erd-recharge-write-authority.metrics';
import { ChargingStationEnrichmentProducerService } from '../../charging-stations/enrichment/charging-station-enrichment-producer.service';
import { shouldAttemptChargingEnrichmentEnqueueAfterProjection } from '../../charging-stations/enrichment/erd-recharge-charging-enrichment-projection-hook.policy';

@Injectable()
export class ErdRechargeCanonicalProjectionRuntimeService {
  private readonly logger = new Logger(ErdRechargeCanonicalProjectionRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly metrics?: ErdRechargeWriteAuthorityMetricsService,
    @Optional()
    private readonly chargingStationEnrichmentProducer?: ChargingStationEnrichmentProducerService,
  ) {}

  /**
   * Post-physical reconcile hook — evaluates ALL persisted sessions (including unchanged)
   * so a prior projection failure can retry on later reconciliation.
   */
  async projectAfterPhysicalReconcile(input: {
    organizationId: string;
    vehicleId: string;
    sessionResults: HvChargeSessionPersistResult[];
    correlationId?: string | null;
    env?: NodeJS.ProcessEnv;
  }): Promise<void> {
    const env = input.env ?? process.env;
    const authority = evaluateErdRechargeWriteAuthority(env);
    this.metrics?.recordAuthority(authority.authority, authority.reason);

    for (const result of input.sessionResults) {
      await this.projectSingleSessionSafe({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        session: result.session,
        correlationId: input.correlationId,
        env,
      });
    }
  }

  async projectSingleSessionSafe(input: {
    organizationId: string;
    vehicleId: string;
    session: HvChargeSessionPersistResult['session'];
    correlationId?: string | null;
    env: NodeJS.ProcessEnv;
    injectFailureAfterCreate?: boolean;
    injectFailureDuringReconcile?: boolean;
    injectFailureAfterHandoff?: boolean;
  }): Promise<ErdRechargeProjectionRuntimeOutcome> {
    const gate = shouldProjectCanonicalRechargeSession({
      session: input.session,
      env: input.env,
    });

    if (!gate.allowed) {
      const outcome =
        gate.skipReason === 'pre_cutover'
          ? ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.SKIPPED_PRE_CUTOVER
          : ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.SKIPPED_LEGACY_AUTHORITY;
      this.metrics?.recordProjectionRuntime(outcome);
      return outcome;
    }

    try {
      const result = await projectCanonicalRecharge(this.prisma, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        chargeSessionId: input.session.id,
        correlationId: input.correlationId ?? null,
        injectFailureAfterCreate: input.injectFailureAfterCreate,
        injectFailureDuringReconcile: input.injectFailureDuringReconcile,
        injectFailureAfterHandoff: input.injectFailureAfterHandoff,
      });

      const mapped = mapProjectorOutcomeToRuntime(result.outcome);
      this.metrics?.recordProjectionRuntime(mapped);
      await this.tryEnqueueChargingEnrichmentAfterProjection(result.outcome, result.vehicleEnergyEventId);
      return mapped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ERD canonical projection isolated failure session=${input.session.id} vehicle=${input.vehicleId}: ${message}`,
      );
      this.metrics?.recordProjectionRuntime(
        ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.FAILED_ISOLATED,
      );
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.FAILED_ISOLATED;
    }
  }

  private async tryEnqueueChargingEnrichmentAfterProjection(
    projectorOutcome: string,
    vehicleEnergyEventId: string | undefined,
  ): Promise<void> {
    if (!vehicleEnergyEventId || !this.chargingStationEnrichmentProducer) return;
    if (!shouldAttemptChargingEnrichmentEnqueueAfterProjection(projectorOutcome)) return;

    try {
      await this.chargingStationEnrichmentProducer.enqueueAfterProjection(vehicleEnergyEventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'charging_station_enrichment_enqueue_isolated_failure',
          energyEventId: vehicleEnergyEventId,
          projectorOutcome,
          message,
        }),
      );
    }
  }
}

function mapProjectorOutcomeToRuntime(
  outcome: (typeof ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME)[keyof typeof ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME],
): ErdRechargeProjectionRuntimeOutcome {
  switch (outcome) {
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CREATED;
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.RECONCILED;
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.NO_OP;
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.HANDOFF_COMPLETED;
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.NOT_PROJECTABLE;
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.LEGACY_DIMO_COLLISION:
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT:
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.DUAL_PROJECTION_CONFLICT:
    case ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.AUTHORITY_CONFLICT:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CONFLICT;
    default:
      return ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CONFLICT;
  }
}
