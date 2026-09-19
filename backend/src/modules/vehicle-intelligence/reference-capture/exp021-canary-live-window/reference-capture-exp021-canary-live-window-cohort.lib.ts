import { EXP021_KS_MX_2024_CANARY } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';

/** First real post-activation live drive — forensic only; never backfill PDI. */
export const EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID =
  'a72fb179-3fca-42a1-bdc1-3461cbcade44';

export type Exp021CanaryCohortMember = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  /** Stable operator label (documentation / CLI); not used in authority predicates. */
  label?: string;
};

export type Exp021CanaryCohortAuthority = {
  members: Exp021CanaryCohortMember[];
  membersByVehicleId: Map<string, Exp021CanaryCohortMember>;
  membersByTokenId: Map<number, Exp021CanaryCohortMember>;
  tokenIds: number[];
};

export const EXP021_CANARY_LIVE_WINDOW_COHORT_JSON_ENV = 'EXP021_CANARY_LIVE_WINDOW_COHORT_JSON';

/** Maturation canary operator may use a dedicated cohort JSON or fall back to live-window cohort env. */
export const EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON_ENV =
  'EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON';

/**
 * Documented initial production cohort (F.S Mobility Service / DIMO).
 * Runtime authority comes from EXP021_CANARY_LIVE_WINDOW_COHORT_JSON when activation is enabled.
 */
export const EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE: readonly Exp021CanaryCohortMember[] = [
  {
    label: 'KS MX 2024',
    organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    tokenId: 187336,
  },
  {
    label: 'KS MS 661',
    organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    tokenId: 187361,
  },
  {
    label: 'WOB L 7503',
    organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    tokenId: 192922,
  },
];

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseCohortMemberRaw(raw: unknown, index: number): Exp021CanaryCohortMember | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const organizationId = typeof row.organizationId === 'string' ? row.organizationId.trim() : '';
  const vehicleId = typeof row.vehicleId === 'string' ? row.vehicleId.trim() : '';
  const tokenId =
    typeof row.tokenId === 'number'
      ? row.tokenId
      : typeof row.tokenId === 'string'
        ? Number.parseInt(row.tokenId, 10)
        : NaN;
  const label = typeof row.label === 'string' ? row.label.trim() : undefined;
  if (!isUuid(organizationId) || !isUuid(vehicleId) || !Number.isInteger(tokenId) || tokenId <= 0) {
    return null;
  }
  return { organizationId, vehicleId, tokenId, label: label || undefined };
}

export function parseExp021CanaryCohortJson(json: string): Exp021CanaryCohortMember[] | null {
  const trimmed = json.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const members: Exp021CanaryCohortMember[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const member = parseCohortMemberRaw(parsed[i], i);
    if (!member) return null;
    members.push(member);
  }
  return members;
}

export function buildExp021CanaryCohortAuthority(
  members: Exp021CanaryCohortMember[],
): Exp021CanaryCohortAuthority | null {
  if (members.length === 0) return null;
  const membersByVehicleId = new Map<string, Exp021CanaryCohortMember>();
  const membersByTokenId = new Map<number, Exp021CanaryCohortMember>();
  const tokenIds: number[] = [];
  for (const member of members) {
    if (membersByVehicleId.has(member.vehicleId)) return null;
    if (membersByTokenId.has(member.tokenId)) return null;
    membersByVehicleId.set(member.vehicleId, member);
    membersByTokenId.set(member.tokenId, member);
    tokenIds.push(member.tokenId);
  }
  tokenIds.sort((a, b) => a - b);
  return { members, membersByVehicleId, membersByTokenId, tokenIds };
}

export function resolveExp021CanaryCohortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Exp021CanaryCohortAuthority | null {
  const raw = env[EXP021_CANARY_LIVE_WINDOW_COHORT_JSON_ENV];
  if (!raw?.trim()) return null;
  const members = parseExp021CanaryCohortJson(raw);
  if (!members) return null;
  return buildExp021CanaryCohortAuthority(members);
}

export function resolveExp021MaturationCanaryCohortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Exp021CanaryCohortAuthority | null {
  const maturationRaw = env[EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON_ENV];
  if (maturationRaw?.trim()) {
    const members = parseExp021CanaryCohortJson(maturationRaw);
    if (!members) return null;
    return buildExp021CanaryCohortAuthority(members);
  }
  return resolveExp021CanaryCohortFromEnv(env);
}

export function resolveCohortMemberForTripIdentity(args: {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  cohort: Exp021CanaryCohortAuthority;
}): Exp021CanaryCohortMember | null {
  const byVehicle = args.cohort.membersByVehicleId.get(args.vehicleId);
  if (!byVehicle) return null;
  if (byVehicle.organizationId !== args.organizationId) return null;
  if (byVehicle.tokenId !== args.tokenId) return null;
  const byToken = args.cohort.membersByTokenId.get(args.tokenId);
  if (!byToken || byToken.vehicleId !== args.vehicleId) return null;
  return byVehicle;
}

export function isForensicExcludedVehicleTrip(vehicleTripId: string): boolean {
  return vehicleTripId === EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID;
}
