export type M2SummaryLike = {
  status?: string;
  shadowGatePassed?: boolean;
  gateReasonCodes?: string[];
  stats?: {
    medianCapacityKwh?: number | null;
    validSampleCount?: number;
    coefficientOfVariation?: number | null;
    socSpanPercent?: number | null;
  };
};

export type M3ValidationLike = {
  gateEligible?: boolean;
  gateReasonCodes?: string[];
  estimatedCapacityKwh?: number | null;
  m2MedianCapacityKwh?: number | null;
  methodConflict?: boolean;
  methodConflictDeviationRatio?: number | null;
  deltaSocPercent?: number | null;
  segmentAddedEnergyKwh?: number | null;
};

export function formatM2SummaryLines(summary: Record<string, unknown> | null): string[] {
  if (!summary) return [];
  const s = summary as M2SummaryLike;
  const lines: string[] = [];
  if (s.status) lines.push(`status: ${s.status}`);
  if (typeof s.shadowGatePassed === 'boolean') {
    lines.push(`shadow gate: ${s.shadowGatePassed ? 'passed' : 'not passed'}`);
  }
  if (s.stats?.medianCapacityKwh != null) {
    lines.push(`median capacity: ${s.stats.medianCapacityKwh.toFixed(2)} kWh`);
  }
  if (s.stats?.validSampleCount != null) {
    lines.push(`valid samples: ${s.stats.validSampleCount}`);
  }
  if (s.stats?.socSpanPercent != null) {
    lines.push(`SOC span: ${s.stats.socSpanPercent.toFixed(1)}%`);
  }
  if (s.stats?.coefficientOfVariation != null) {
    lines.push(`CV: ${(s.stats.coefficientOfVariation * 100).toFixed(2)}%`);
  }
  if (Array.isArray(s.gateReasonCodes) && s.gateReasonCodes.length > 0) {
    lines.push(`gate reasons: ${s.gateReasonCodes.join(', ')}`);
  }
  return lines;
}

export function formatM3ValidationLines(validation: Record<string, unknown> | null): string[] {
  if (!validation) return [];
  const v = validation as M3ValidationLike;
  const lines: string[] = [];
  if (typeof v.gateEligible === 'boolean') {
    lines.push(`M3 gate: ${v.gateEligible ? 'eligible' : 'not eligible'}`);
  }
  if (v.estimatedCapacityKwh != null) {
    lines.push(`M3 capacity: ${v.estimatedCapacityKwh.toFixed(2)} kWh`);
  }
  if (v.m2MedianCapacityKwh != null) {
    lines.push(`M2 median (context): ${v.m2MedianCapacityKwh.toFixed(2)} kWh`);
  }
  if (v.methodConflict) {
    const ratio =
      v.methodConflictDeviationRatio != null
        ? ` (${(v.methodConflictDeviationRatio * 100).toFixed(1)}% deviation)`
        : '';
    lines.push(`method conflict: yes${ratio}`);
  }
  if (v.deltaSocPercent != null) {
    lines.push(`ΔSOC: ${v.deltaSocPercent.toFixed(1)}%`);
  }
  if (v.segmentAddedEnergyKwh != null) {
    lines.push(`segment energy: ${v.segmentAddedEnergyKwh.toFixed(2)} kWh`);
  }
  if (Array.isArray(v.gateReasonCodes) && v.gateReasonCodes.length > 0) {
    lines.push(`gate reasons: ${v.gateReasonCodes.join(', ')}`);
  }
  return lines;
}

export function formatExclusionList(codes: string[]): string {
  if (codes.length === 0) return '—';
  return codes.join(', ');
}
