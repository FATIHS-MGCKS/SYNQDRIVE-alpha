import { Injectable } from '@nestjs/common';
import { MisuseCaseReconcileService } from './misuse-case-reconcile/misuse-case-reconcile.service';

/**
 * @deprecated Prefer MisuseCaseReconcileService.reconcileTrip / DRIVING_MISUSE_RECONCILE job.
 * Thin wrapper kept for legacy fire-and-forget callers.
 */
@Injectable()
export class MisuseCaseAggregatorService {
  constructor(private readonly reconcile: MisuseCaseReconcileService) {}

  async evaluateTrip(tripId: string): Promise<number> {
    return this.reconcile.evaluateTrip(tripId);
  }
}
