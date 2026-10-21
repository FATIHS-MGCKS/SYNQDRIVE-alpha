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

export interface M3_3HvH1SessionEvidenceFieldPresence {
  socStart: boolean;
  socEnd: boolean;
  currentEnergyStart: boolean;
  currentEnergyEnd: boolean;
  addedEnergy: boolean;
  providerTimestamp: boolean;
  capacityM2: boolean;
  capacityM3: boolean;
}

export interface ClassifySessionEvidenceLinkageInput {
  sessionId: string;
  segmentFingerprint: string;
  source: string;
  isFallback: boolean;
  hasDimoSegmentId: boolean;
  presence: M3_3HvH1SessionEvidenceFieldPresence;
}

export interface M3_3HvH1SessionEvidenceLinkageRowV1 {
  field: string;
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

export function buildM3_3HvH1SessionEvidenceLinkageV1(
  input: ClassifySessionEvidenceLinkageInput,
): M3_3HvH1SessionEvidenceLinkageV1 {
  const segmentLinkage: M3_3HvH1SessionLinkageKind = input.hasDimoSegmentId
    ? 'PROVIDER_SEGMENT'
    : input.isFallback
      ? 'FALLBACK'
      : 'UNLINKED';

  const link = (
    field: string,
    present: boolean,
    whenPresent: M3_3HvH1SessionLinkageKind,
    authority: string,
    provenanceField?: string,
  ): M3_3HvH1SessionEvidenceLinkageRowV1 => ({
    field,
    linkage: present ? whenPresent : 'UNLINKED',
    authority,
    provenanceField,
  });

  const p = input.presence;

  const linkages: M3_3HvH1SessionEvidenceLinkageRowV1[] = [
    {
      field: 'recharge_segment_identity',
      linkage: input.hasDimoSegmentId || input.isFallback ? segmentLinkage : 'UNLINKED',
      authority: 'ERD segment boundary; BI persists segmentFingerprint',
      provenanceField: 'segmentFingerprint / dimoSegmentId',
    },
    link('soc_start', p.socStart, 'DIRECT', 'HvChargeSession.startSocPercent'),
    link('soc_end', p.socEnd, 'DIRECT', 'HvChargeSession.endSocPercent'),
    link(
      'current_energy_start',
      p.currentEnergyStart,
      input.isFallback ? 'WINDOW_DERIVED' : 'DIRECT',
      'HvChargeSession.startEnergyKwh',
      'metadata.currentEnergyProvenance',
    ),
    link(
      'current_energy_end',
      p.currentEnergyEnd,
      input.isFallback ? 'WINDOW_DERIVED' : 'DIRECT',
      'HvChargeSession.endEnergyKwh',
    ),
    link(
      'added_energy',
      p.addedEnergy,
      'SESSION_AGGREGATE',
      'HvChargeSession.energyAddedKwh',
      'metadata.addedEnergyProvenance',
    ),
    link(
      'provider_timestamp',
      p.providerTimestamp,
      'DIRECT',
      'HvChargeSession.providerObservedAt',
    ),
    link(
      'capacity_m2',
      p.capacityM2,
      'SESSION_AGGREGATE',
      'metadata.m2CapacitySummary',
    ),
    link('capacity_m3', p.capacityM3, 'SESSION_AGGREGATE', 'metadata.m3Validation'),
    {
      field: 'provider_soh',
      linkage: 'UNLINKED',
      authority: 'Provider SOH via snapshots/measurements — not session-embedded by default',
    },
    {
      field: 'ground_truth',
      linkage: 'UNLINKED',
      authority: 'BatteryGroundTruthEvent (batteryScope=HV) — future correlation only',
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

export function sessionFieldPresenceFromRecord(session: {
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  providerObservedAt: Date | null;
  metadata: unknown;
}): M3_3HvH1SessionEvidenceFieldPresence {
  const meta = session.metadata as Record<string, unknown> | null;
  return {
    socStart: session.startSocPercent != null,
    socEnd: session.endSocPercent != null,
    currentEnergyStart: session.startEnergyKwh != null,
    currentEnergyEnd: session.endEnergyKwh != null,
    addedEnergy: session.energyAddedKwh != null,
    providerTimestamp: session.providerObservedAt != null,
    capacityM2: meta?.m2CapacitySummary != null,
    capacityM3: meta?.m3Validation != null,
  };
}
