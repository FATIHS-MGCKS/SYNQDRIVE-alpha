import type { GovernanceGlobalProfileDto } from './types';

export type ProfileDraft = {
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  mobile: string;
  address: string;
  language: string;
  timezone: string;
  dateFormat: string;
};

export function profileDtoToDraft(source: GovernanceGlobalProfileDto): ProfileDraft {
  return {
    name: source.name ?? '',
    firstName: source.firstName ?? '',
    lastName: source.lastName ?? '',
    phone: source.phone ?? '',
    mobile: source.mobile ?? '',
    address: source.address ?? '',
    language: source.language ?? '',
    timezone: source.timezone ?? '',
    dateFormat: source.dateFormat ?? '',
  };
}

const CLEARABLE: (keyof ProfileDraft)[] = ['phone', 'mobile', 'address'];

export function buildChangedProfilePatch(
  original: GovernanceGlobalProfileDto,
  draft: ProfileDraft,
): Record<string, string | null> | null {
  const patch: Record<string, string | null> = {};
  const keys = Object.keys(draft) as (keyof ProfileDraft)[];
  for (const key of keys) {
    const origVal = (original[key] as string | null) ?? '';
    const nextTrimmed = draft[key].trim();
    const origNormalized = origVal;
    if (nextTrimmed === origNormalized) continue;
    if (!nextTrimmed && CLEARABLE.includes(key)) {
      patch[key] = null;
    } else if (nextTrimmed) {
      patch[key] = nextTrimmed;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function draftsEqualForNoOp(original: GovernanceGlobalProfileDto, draft: ProfileDraft): boolean {
  return buildChangedProfilePatch(original, draft) === null;
}