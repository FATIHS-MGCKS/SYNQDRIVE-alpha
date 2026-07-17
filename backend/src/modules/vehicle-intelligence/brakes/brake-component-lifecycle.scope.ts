import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationType,
  BrakeServiceKind,
} from '@prisma/client';

export type BrakeLifecycleScopeToken =
  | 'front_pads'
  | 'rear_pads'
  | 'front_discs'
  | 'rear_discs'
  | 'FRONT_PADS'
  | 'REAR_PADS'
  | 'FRONT_DISCS'
  | 'REAR_DISCS';

export const ALL_BRAKE_COMPONENT_TYPES: BrakeComponentInstallationType[] = [
  BrakeComponentInstallationType.FRONT_PADS,
  BrakeComponentInstallationType.REAR_PADS,
  BrakeComponentInstallationType.FRONT_DISCS,
  BrakeComponentInstallationType.REAR_DISCS,
];

const SCOPE_TOKEN_MAP: Record<string, BrakeComponentInstallationType> = {
  front_pads: BrakeComponentInstallationType.FRONT_PADS,
  front_pad: BrakeComponentInstallationType.FRONT_PADS,
  FRONT_PADS: BrakeComponentInstallationType.FRONT_PADS,
  FRONT_PAD: BrakeComponentInstallationType.FRONT_PADS,
  rear_pads: BrakeComponentInstallationType.REAR_PADS,
  rear_pad: BrakeComponentInstallationType.REAR_PADS,
  REAR_PADS: BrakeComponentInstallationType.REAR_PADS,
  REAR_PAD: BrakeComponentInstallationType.REAR_PADS,
  front_discs: BrakeComponentInstallationType.FRONT_DISCS,
  front_disc: BrakeComponentInstallationType.FRONT_DISCS,
  FRONT_DISCS: BrakeComponentInstallationType.FRONT_DISCS,
  FRONT_DISC: BrakeComponentInstallationType.FRONT_DISCS,
  rear_discs: BrakeComponentInstallationType.REAR_DISCS,
  rear_disc: BrakeComponentInstallationType.REAR_DISCS,
  REAR_DISCS: BrakeComponentInstallationType.REAR_DISCS,
  REAR_DISC: BrakeComponentInstallationType.REAR_DISCS,
};

export function normalizeScopeTokens(scope?: BrakeLifecycleScopeToken[]): BrakeComponentInstallationType[] {
  if (!Array.isArray(scope)) return [];
  const out: BrakeComponentInstallationType[] = [];
  for (const token of scope) {
    const mapped = SCOPE_TOKEN_MAP[String(token).trim()];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export function assertExplicitScope(
  components: BrakeComponentInstallationType[],
  options?: { serviceKind?: BrakeServiceKind | null; requireNonEmpty?: boolean },
): void {
  if (options?.serviceKind === BrakeServiceKind.FULL_BRAKE_SERVICE && components.length === 0) {
    throw new Error('full_service_requires_explicit_scope');
  }
  if (options?.requireNonEmpty !== false && components.length === 0) {
    throw new Error('explicit_scope_required');
  }
}

export function assertScopeAllowsOnly(
  allowed: BrakeComponentInstallationType[],
  requested: BrakeComponentInstallationType[],
): void {
  for (const component of requested) {
    if (!allowed.includes(component)) {
      throw new Error(`scope_violation:${component}`);
    }
  }
}

/** Front axle pad replacement must not mutate rear or disc components unless explicitly scoped. */
export function validateAxleScopedSet(components: BrakeComponentInstallationType[]): void {
  const set = new Set(components);
  const hasAllFour =
    set.has(BrakeComponentInstallationType.FRONT_PADS) &&
    set.has(BrakeComponentInstallationType.REAR_PADS) &&
    set.has(BrakeComponentInstallationType.FRONT_DISCS) &&
    set.has(BrakeComponentInstallationType.REAR_DISCS);
  if (hasAllFour) return;

  if (set.has(BrakeComponentInstallationType.FRONT_PADS) && set.has(BrakeComponentInstallationType.REAR_DISCS)) {
    throw new Error('scope_violation:front_pads_with_rear_discs');
  }
  if (set.has(BrakeComponentInstallationType.REAR_PADS) && set.has(BrakeComponentInstallationType.FRONT_DISCS)) {
    throw new Error('scope_violation:rear_pads_with_front_discs');
  }
}

export function componentToLifecycleScope(
  component: BrakeComponentInstallationType,
): BrakeLifecycleScopeToken {
  switch (component) {
    case BrakeComponentInstallationType.FRONT_PADS:
      return 'front_pads';
    case BrakeComponentInstallationType.REAR_PADS:
      return 'rear_pads';
    case BrakeComponentInstallationType.FRONT_DISCS:
      return 'front_discs';
    default:
      return 'rear_discs';
  }
}

export function thicknessFieldForComponent(
  component: BrakeComponentInstallationType,
): 'frontPadMm' | 'rearPadMm' | 'frontDiscMm' | 'rearDiscMm' {
  switch (component) {
    case BrakeComponentInstallationType.FRONT_PADS:
      return 'frontPadMm';
    case BrakeComponentInstallationType.REAR_PADS:
      return 'rearPadMm';
    case BrakeComponentInstallationType.FRONT_DISCS:
      return 'frontDiscMm';
    default:
      return 'rearDiscMm';
  }
}

export function isMeasuredAnchorSource(
  source: BrakeComponentInstallationAnchorSource,
): boolean {
  return source === BrakeComponentInstallationAnchorSource.MEASURED;
}
