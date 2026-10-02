import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class ErdRechargeShadowParityMetricsService {
  readonly comparisonsTotal: Counter<string>;
  readonly pairingTotal: Counter<string>;
  readonly fieldMismatchTotal: Counter<string>;
  readonly runsTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;
    this.comparisonsTotal = new Counter({
      name: 'synqdrive_erd_recharge_shadow_comparisons_total',
      help: 'Shadow parity observations by parity class',
      labelNames: ['parity_class'],
      registers: [register],
    });
    this.pairingTotal = new Counter({
      name: 'synqdrive_erd_recharge_shadow_pairing_total',
      help: 'Shadow pairing evidence counts',
      labelNames: ['pairing_evidence'],
      registers: [register],
    });
    this.fieldMismatchTotal = new Counter({
      name: 'synqdrive_erd_recharge_shadow_field_mismatch_total',
      help: 'Shadow field mismatch counts by field name',
      labelNames: ['field'],
      registers: [register],
    });
    this.runsTotal = new Counter({
      name: 'synqdrive_erd_recharge_shadow_runs_total',
      help: 'Shadow parity run outcomes',
      labelNames: ['result'],
      registers: [register],
    });
  }

  recordObservation(input: {
    parityClass: string;
    pairingEvidence: string;
    fieldMismatchFields: string[];
  }): void {
    this.comparisonsTotal.inc({ parity_class: input.parityClass });
    this.pairingTotal.inc({ pairing_evidence: input.pairingEvidence });
    for (const field of input.fieldMismatchFields) {
      this.fieldMismatchTotal.inc({ field });
    }
  }

  recordRun(result: string): void {
    this.runsTotal.inc({ result });
  }
}
