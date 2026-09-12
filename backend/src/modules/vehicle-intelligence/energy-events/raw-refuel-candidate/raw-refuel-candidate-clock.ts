/** Service-owned SynqDrive observation clock — not provider telemetry time. */
export interface RawRefuelCandidateClock {
  now(): Date;
}

export class SystemRawRefuelCandidateClock implements RawRefuelCandidateClock {
  now(): Date {
    return new Date();
  }
}

export class FixedRawRefuelCandidateClock implements RawRefuelCandidateClock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return new Date(this.fixed);
  }
}
