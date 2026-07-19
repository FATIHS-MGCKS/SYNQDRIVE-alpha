import { EpisodeConflictReasonCode } from './device-connection-episode-conflict';
import { hashProviderDeviceId } from './device-connection-episode.service';

export type BindingClass =
  | 'PHYSICAL_OBD_LTE_R1'
  | 'PHYSICAL_OBD_AFTERMARKET'
  | 'OEM_API'
  | 'SYNTHETIC_ONLY'
  | 'UNKNOWN';

/**
 * Canonical device-binding identity for episode scoping.
 * Combines DIMO token, data-source link, provider vehicle, and source class.
 */
export interface CanonicalDeviceBinding {
  bindingId: string | null;
  providerDeviceIdHash: string;
  dimoTokenId: number;
  provider: string;
  sourceType: string;
  sourceSubtype: string | null;
  sourceReferenceId: string | null;
  bindingClass: BindingClass;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  physicalObdCapable: boolean;
}

export interface BindingScopeEpisodeRefs {
  deviceBindingId: string | null;
  providerDeviceIdHash: string | null;
}

export function classifyBindingSource(input: {
  hardwareType: string | null | undefined;
  sourceSubtype: string | null | undefined;
}): BindingClass {
  const hardware = (input.hardwareType ?? '').trim().toUpperCase();
  const subtype = (input.sourceSubtype ?? '').trim().toUpperCase();

  if (subtype.includes('SYNTHETIC')) return 'SYNTHETIC_ONLY';
  if (subtype.includes('OEM') && !subtype.includes('OBD')) return 'OEM_API';
  if (hardware === 'LTE_R1') return 'PHYSICAL_OBD_LTE_R1';
  if (hardware.includes('OBD') || hardware.includes('R1')) {
    return 'PHYSICAL_OBD_AFTERMARKET';
  }
  if (hardware && hardware !== 'NONE') return 'OEM_API';
  return 'UNKNOWN';
}

export function buildCanonicalDeviceBinding(input: {
  provider: string;
  dimoTokenId: number;
  hardwareType: string | null;
  link: {
    id: string;
    sourceType: string;
    sourceSubtype: string | null;
    sourceReferenceId: string;
    activatedAt: Date;
    deactivatedAt: Date | null;
  } | null;
}): CanonicalDeviceBinding {
  const bindingClass = classifyBindingSource({
    hardwareType: input.hardwareType,
    sourceSubtype: input.link?.sourceSubtype,
  });

  return {
    bindingId: input.link?.id ?? null,
    providerDeviceIdHash: hashProviderDeviceId(input.provider, input.dimoTokenId),
    dimoTokenId: input.dimoTokenId,
    provider: input.provider,
    sourceType: input.link?.sourceType ?? 'NONE',
    sourceSubtype: input.link?.sourceSubtype ?? null,
    sourceReferenceId: input.link?.sourceReferenceId ?? null,
    bindingClass,
    activatedAt: input.link?.activatedAt ?? null,
    deactivatedAt: input.link?.deactivatedAt ?? null,
    physicalObdCapable:
      bindingClass === 'PHYSICAL_OBD_LTE_R1' ||
      bindingClass === 'PHYSICAL_OBD_AFTERMARKET',
  };
}

export function bindingScopeMatches(
  episode: BindingScopeEpisodeRefs,
  binding: CanonicalDeviceBinding,
): boolean {
  if (
    episode.deviceBindingId != null &&
    binding.bindingId != null &&
    episode.deviceBindingId !== binding.bindingId
  ) {
    return false;
  }

  if (
    episode.providerDeviceIdHash != null &&
    episode.providerDeviceIdHash !== binding.providerDeviceIdHash
  ) {
    return false;
  }

  return true;
}

export function bindingScopeChanged(
  episode: BindingScopeEpisodeRefs,
  binding: CanonicalDeviceBinding,
): boolean {
  return !bindingScopeMatches(episode, binding);
}

export function describeBindingScopeChange(
  episode: BindingScopeEpisodeRefs,
  binding: CanonicalDeviceBinding,
): EpisodeConflictReasonCode[] {
  const reasons: EpisodeConflictReasonCode[] = [];

  if (
    episode.deviceBindingId != null &&
    binding.bindingId != null &&
    episode.deviceBindingId !== binding.bindingId
  ) {
    reasons.push(EpisodeConflictReasonCode.BINDING_ID_CHANGED);
  }

  if (
    episode.providerDeviceIdHash != null &&
    episode.providerDeviceIdHash !== binding.providerDeviceIdHash
  ) {
    reasons.push(EpisodeConflictReasonCode.TOKEN_CHANGED);
    reasons.push(EpisodeConflictReasonCode.PROVIDER_DEVICE_HASH_MISMATCH);
  }

  if (reasons.length === 0) {
    reasons.push(EpisodeConflictReasonCode.AMBIGUOUS_BINDING_CHANGE);
  }

  return reasons;
}

export function episodeBindingRelevantForCurrentBinding(
  episode: BindingScopeEpisodeRefs & { status: string },
  binding: CanonicalDeviceBinding,
): boolean {
  if (episode.status !== 'OPEN') return false;
  return bindingScopeMatches(episode, binding);
}
