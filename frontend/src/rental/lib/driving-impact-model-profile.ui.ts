export type DrivingImpactModelProfileId =
  | 'LTE_R1_NATIVE'
  | 'ICE_SIGNAL_CONTEXT'
  | 'SMART5_LIMITED'
  | 'TESLA_LIMITED'
  | 'UNKNOWN_LIMITED';

export interface DrivingImpactModelProfileView {
  version: string;
  profile: DrivingImpactModelProfileId;
  comparabilityGroup?: string;
  behavioralIngestionPath?: string;
  comparabilityHint?: string;
  gatingApplied?: boolean;
  reasonCodes?: string[];
}

const PROFILE_LABELS: Record<DrivingImpactModelProfileId, string> = {
  LTE_R1_NATIVE: 'LTE R1 (native)',
  ICE_SIGNAL_CONTEXT: 'LTE R1 ICE (Motor-Kontext)',
  SMART5_LIMITED: 'SMART5 (HF-Rekonstruktion)',
  TESLA_LIMITED: 'EV (begrenzte Signale)',
  UNKNOWN_LIMITED: 'Unbekannte Hardware (HF)',
};

export function getDrivingImpactModelProfileLabel(
  profile: DrivingImpactModelProfileView | null | undefined,
): string | null {
  if (!profile?.profile) return null;
  return PROFILE_LABELS[profile.profile] ?? profile.profile;
}

export function getDrivingImpactComparabilityHint(
  profile: DrivingImpactModelProfileView | null | undefined,
): string | null {
  const hint = profile?.comparabilityHint?.trim();
  return hint ? hint : null;
}

export function formatDrivingImpactModelProfileFootnote(
  profile: DrivingImpactModelProfileView | null | undefined,
): string | null {
  if (!profile) return null;
  const label = getDrivingImpactModelProfileLabel(profile);
  const hint = getDrivingImpactComparabilityHint(profile);
  if (!label && !hint) return null;
  const version = profile.version ? ` · ${profile.version}` : '';
  if (hint) {
    return `${label ?? profile.profile}${version}: ${hint}`;
  }
  return `${label ?? profile.profile}${version}`;
}
