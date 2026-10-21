export class M3_3HvH2InvalidReportBoundError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly value: number | undefined,
  ) {
    super(
      `M3.3-HV-H2: invalid ${fieldName}=${String(value)}; must be a finite integer >= 1`,
    );
    this.name = 'M3_3HvH2InvalidReportBoundError';
  }
}

/**
 * Resolve operator bounds: reject 0/negative/non-finite; clamp above hard max to hard.
 */
export function resolveM3_3HvH2ReportBound(
  value: number | undefined,
  defaultVal: number,
  hardMax: number,
  fieldName: string,
): number {
  const raw = value ?? defaultVal;
  if (!Number.isFinite(raw) || raw < 1) {
    throw new M3_3HvH2InvalidReportBoundError(fieldName, value);
  }
  const floored = Math.floor(raw);
  return Math.min(floored, hardMax);
}
