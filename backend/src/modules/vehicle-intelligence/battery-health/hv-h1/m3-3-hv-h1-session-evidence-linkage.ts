import { M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1 } from './m3-3-hv-h1.constants';

export const M3_3_HV_H1_SESSION_LINKAGE_KINDS = [
  'DIRECT',
  'WINDOW_DERIVED',
  'SESSION_AGGREGATE',
  'PROVIDER_SEGMENT',
  'FALLBACK',
  'UNLINKED',
] as const;

export type M3_3HvH1SessionLinkageKind = (typeof M3_3_HV_H1_SESSION_LINKAGE_KINDS)[number];

export const M3_3_HV_H1_SESSION_EVIDENCE_FIELDS = [
  'recharge_segment_identity',
  'soc_start',
  'soc_end',
  'current_energy_start',
  'current_energy_end',
  'added_energy',
  'charging_power',
  'provider_timestamp',
  'capacity_m2',
  'capacity_m3',
  'provider_soh',
  'ground_truth',
] as const;

export type M3_3HvH1SessionEvidenceField =
  (typeof M3_3_HV_H1_SESSION_EVIDENCE_FIELDS)[number];

export interface M3_3HvH1SessionEvidenceLinkageRowV1 {
  field: M3_3HvH1SessionEvidenceField;
  linkage: M3_3HvH1SessionLinkageKind;
  authority: string;
  provenanceField?: string;
}

export interface M3_3HvH1SessionEvidenceLinkageV1 {
  contractVersion: typeof M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1;
  sessionId: string;
  segmentFingerprint: string;
  source: string;
  linkages: M3_3HvH1SessionEvidenceLinkageRowV1[];
}

export interface ClassifySessionEvidenceLinkageInput {
  sessionId: string;
  segmentFingerprint: string;
  source: string;
  isFallback: boolean;
  hasDimoSegmentId: boolean;
  metadataHasM2: boolean;
  metadataHasM3: boolean;
}

/** Pure authority map — no DB access. */
export function buildM3_3HvH1SessionEvidenceLinkageV1(
  input: ClassifySessionEvidenceLinkageInput,
): M3_3HvH1SessionEvidenceLinkageV1 {
  const segmentLinkage: M3_3HvH1SessionLinkageKind = input.hasDimoSegmentId
    ? 'PROVIDER_SEGMENT'
    : input.isFallback
      ? 'FALLBACK'
      : 'UNLINKED';

  const linkages: M3_3HvH1SessionEvidenceLinkageRowV1[] = [
    {
      field: 'recharge_segment_identity',
      linkage: segmentLinkage,
      authority: 'ERD physical segment boundary; BI persists HvChargeSession.segmentFingerprint',
      provenanceField: 'segmentFingerprint / dimoSegmentId',
    },
    {
      field: 'soc_start',
      linkage: 'DIRECT',
      authority: 'HvChargeSession.startSocPercent',
    },
    {
      field: 'soc_end',
      linkage: 'DIRECT',
      authority: 'HvChargeSession.endSocPercent',
    },
    {
      field: 'current_energy_start',
      linkage: input.isFallback ? 'WINDOW_DERIVED' : 'DIRECT',
      authority: 'HvChargeSession.startEnergyKwh',
      provenanceField: 'metadata.currentEnergyProvenance',
    },
    {
      field: 'current_energy_end',
      linkage: input.isFallback ? 'WINDOW_DERIVED' : 'DIRECT',
      authority: 'HvChargeSession.endEnergyKwh',
    },
    {
      field: 'added_energy',
      linkage: 'SESSION_AGGREGATE',
      authority: 'HvChargeSession.energyAddedKwh (segment semantics)',
      provenanceField: 'metadata.addedEnergyProvenance',
    },
    {
      field: 'charging_power',
      linkage: 'WINDOW_DERIVED',
      authority: 'Poll window / session aggregates (not simultaneous snapshot proof)',
    },
    {
      field: 'provider_timestamp',
      linkage: 'DIRECT',
      authority: 'HvChargeSession.providerObservedAt',
    },
    {
      field: 'capacity_m2',
      linkage: input.metadataHasM2 ? 'SESSION_AGGREGATE' : 'UNLINKED',
      authority: 'hv-capacity-shadow M2 shadow (metadata.m2CapacitySummary)',
    },
    {
      field: 'capacity_m3',
      linkage: input.metadataHasM3 ? 'SESSION_AGGREGATE' : 'UNLINKED',
      authority: 'hv-capacity-shadow M3 validation (metadata.m3Validation)',
    },
    {
      field: 'provider_soh',
      linkage: 'UNLINKED',
      authority: 'Provider SOH observations via snapshots/measurements — not session-embedded by default',
    },
    {
      field: 'ground_truth',
      linkage: 'UNLINKED',
      authority: 'BatteryGroundTruthEvent (batteryScope=HV) — future G4 correlation only',
    },
  ];

  return {
    contractVersion: M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1,
    sessionId: input.sessionId,
    segmentFingerprint: input.segmentFingerprint,
    source: input.source,
    linkages,
  };
}
