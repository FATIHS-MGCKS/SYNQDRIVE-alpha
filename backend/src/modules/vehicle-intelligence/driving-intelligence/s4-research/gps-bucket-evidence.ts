import type { ResearchGpsBucket } from './contracts';

export type GpsBucketEvidenceTag =
  | 'POSITION_PRESENT'
  | 'ROW_ABSENT'
  | 'QC_UNTRUSTED'
  | 'TRUSTED_SPEED'
  | 'INSUFFICIENT_EVIDENCE';

export type GpsBucketEvidenceRecord = {
  bucketLabelUtc: string;
  observedTags: GpsBucketEvidenceTag[];
  reasons: string[];
};

function isTrustedQc(q: string | null | undefined): boolean {
  return q === 'TRUSTED' || q === 'TRUSTED_LIMITED';
}

/**
 * Tags GPS/QC observability per bucket. Does not infer standstill from missing coordinates.
 */
export function analyzeGpsBucketEvidence(buckets: ResearchGpsBucket[]): GpsBucketEvidenceRecord[] {
  return buckets.map((b) => {
    const observed: GpsBucketEvidenceTag[] = [];
    const reasons: string[] = [];
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
      observed.push('POSITION_PRESENT');
    } else if (b.availability === 'ROW_ABSENT') {
      observed.push('ROW_ABSENT');
      reasons.push('ROW_ABSENT');
    } else {
      observed.push('INSUFFICIENT_EVIDENCE');
      reasons.push('NO_FINITE_COORDINATES');
    }
    if (b.qcTrustLevel && !isTrustedQc(b.qcTrustLevel)) {
      observed.push('QC_UNTRUSTED');
      reasons.push(`QC_${b.qcTrustLevel}`);
    }
    if (b.l3SpeedKmh != null && isTrustedQc(b.qcTrustLevel)) {
      observed.push('TRUSTED_SPEED');
    }
    return { bucketLabelUtc: b.bucketLabelUtc, observedTags: observed, reasons };
  });
}
