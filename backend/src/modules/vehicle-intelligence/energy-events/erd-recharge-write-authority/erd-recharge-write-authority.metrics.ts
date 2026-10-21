import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type {
  ErdRechargeLegacyWriteGateOutcome,
  ErdRechargeProjectionRuntimeOutcome,
  ErdRechargeWriteAuthority,
  ErdRechargeWriteAuthorityReason,
} from './erd-recharge-write-authority.constants';

@Injectable()
export class ErdRechargeWriteAuthorityMetricsService {
  readonly authorityTotal: Counter<string>;
  readonly projectionRuntimeTotal: Counter<string>;
  readonly legacyWriteGateTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    this.authorityTotal = new Counter({
      name: 'synqdrive_erd_recharge_write_authority_total',
      help: 'ERD recharge global write authority evaluations (bounded labels)',
      labelNames: ['authority', 'reason'],
      registers: [this.tripMetrics.registry],
    });
    this.projectionRuntimeTotal = new Counter({
      name: 'synqdrive_erd_recharge_projection_runtime_total',
      help: 'ERD canonical recharge projection runtime outcomes (bounded labels)',
      labelNames: ['outcome'],
      registers: [this.tripMetrics.registry],
    });
    this.legacyWriteGateTotal = new Counter({
      name: 'synqdrive_erd_recharge_legacy_write_gate_total',
      help: 'Legacy DIMO RECHARGE write gate outcomes (bounded labels)',
      labelNames: ['outcome'],
      registers: [this.tripMetrics.registry],
    });
  }

  recordAuthority(authority: ErdRechargeWriteAuthority, reason: ErdRechargeWriteAuthorityReason): void {
    this.authorityTotal.inc({ authority, reason });
  }

  recordProjectionRuntime(outcome: ErdRechargeProjectionRuntimeOutcome): void {
    this.projectionRuntimeTotal.inc({ outcome });
  }

  recordLegacyWriteGate(outcome: ErdRechargeLegacyWriteGateOutcome): void {
    this.legacyWriteGateTotal.inc({ outcome });
  }
}
