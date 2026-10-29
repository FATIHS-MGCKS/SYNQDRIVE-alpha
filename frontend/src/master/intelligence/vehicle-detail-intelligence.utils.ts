import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';

export function pickPrimaryProviderSourceLink(
  profiles: MasterVsiProfileSummaryDto[],
  preferredLinkId: string | null,
): { linkId: string | null; ambiguous: boolean } {
  if (profiles.length === 0) return { linkId: null, ambiguous: false };
  if (preferredLinkId && profiles.some((p) => p.providerSourceLinkId === preferredLinkId)) {
    return { linkId: preferredLinkId, ambiguous: profiles.length > 1 };
  }
  if (profiles.length === 1) return { linkId: profiles[0]!.providerSourceLinkId, ambiguous: false };
  return { linkId: profiles[0]!.providerSourceLinkId, ambiguous: true };
}
