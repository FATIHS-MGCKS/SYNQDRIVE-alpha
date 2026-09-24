import { D4_INSPECTION_DB_ROUND_TRIP_BOUND } from './longitudinal-integrity-inspection.constants';

/** Per-inspection SQL round-trip budget (no process-global mutable state). */
export class D4InspectionDbRoundTripBudget {
  private count = 0;

  increment(): void {
    this.count += 1;
  }

  getCount(): number {
    return this.count;
  }

  assertWithinBound(max = D4_INSPECTION_DB_ROUND_TRIP_BOUND): void {
    if (this.count > max) {
      throw new Error(
        `D4 inspection exceeded DB round trip bound (${this.count} > ${max})`,
      );
    }
  }
}
