import {
  BrakeComponentInstallationType,
  BrakeServiceKind,
} from '@prisma/client';
import {
  assertExplicitScope,
  assertScopeAllowsOnly,
  normalizeScopeTokens,
  thicknessFieldForComponent,
  validateAxleScopedSet,
  type BrakeLifecycleScopeToken,
} from './brake-component-lifecycle.scope';

export type BrakeMeasuredSnapshot = {
  frontPadMm: number | null;
  rearPadMm: number | null;
  frontDiscMm: number | null;
  rearDiscMm: number | null;
};

export type BrakeServiceScopeProfile =
  | 'INSPECTION_ONLY'
  | 'BRAKE_FLUID_SERVICE'
  | 'FRONT_PADS_REPLACED'
  | 'REAR_PADS_REPLACED'
  | 'FRONT_DISCS_REPLACED'
  | 'REAR_DISCS_REPLACED'
  | 'FRONT_PADS_AND_DISCS'
  | 'REAR_PADS_AND_DISCS'
  | 'FULL_BRAKE_SERVICE';

/** Components a service profile may mutate when replacement is confirmed. */
const PROFILE_COMPONENTS: Record<BrakeServiceScopeProfile, BrakeComponentInstallationType[]> = {
  INSPECTION_ONLY: [],
  BRAKE_FLUID_SERVICE: [],
  FRONT_PADS_REPLACED: [BrakeComponentInstallationType.FRONT_PADS],
  REAR_PADS_REPLACED: [BrakeComponentInstallationType.REAR_PADS],
  FRONT_DISCS_REPLACED: [BrakeComponentInstallationType.FRONT_DISCS],
  REAR_DISCS_REPLACED: [BrakeComponentInstallationType.REAR_DISCS],
  FRONT_PADS_AND_DISCS: [
    BrakeComponentInstallationType.FRONT_PADS,
    BrakeComponentInstallationType.FRONT_DISCS,
  ],
  REAR_PADS_AND_DISCS: [
    BrakeComponentInstallationType.REAR_PADS,
    BrakeComponentInstallationType.REAR_DISCS,
  ],
  FULL_BRAKE_SERVICE: [],
};

const PAD_COMPONENTS = new Set<BrakeComponentInstallationType>([
  BrakeComponentInstallationType.FRONT_PADS,
  BrakeComponentInstallationType.REAR_PADS,
]);

const DISC_COMPONENTS = new Set<BrakeComponentInstallationType>([
  BrakeComponentInstallationType.FRONT_DISCS,
  BrakeComponentInstallationType.REAR_DISCS,
]);

export function profileForExplicitScope(
  scope: BrakeLifecycleScopeToken[],
): BrakeServiceScopeProfile | null {
  const normalized = normalizeScopeTokens(scope).sort().join(',');
  switch (normalized) {
    case BrakeComponentInstallationType.FRONT_PADS:
      return 'FRONT_PADS_REPLACED';
    case BrakeComponentInstallationType.REAR_PADS:
      return 'REAR_PADS_REPLACED';
    case BrakeComponentInstallationType.FRONT_DISCS:
      return 'FRONT_DISCS_REPLACED';
    case BrakeComponentInstallationType.REAR_DISCS:
      return 'REAR_DISCS_REPLACED';
    case `${BrakeComponentInstallationType.FRONT_DISCS},${BrakeComponentInstallationType.FRONT_PADS}`:
      return 'FRONT_PADS_AND_DISCS';
    case `${BrakeComponentInstallationType.REAR_DISCS},${BrakeComponentInstallationType.REAR_PADS}`:
      return 'REAR_PADS_AND_DISCS';
    default:
      return null;
  }
}

export function inferScopeFromMeasurements(
  measured: BrakeMeasuredSnapshot,
): BrakeComponentInstallationType[] {
  const out: BrakeComponentInstallationType[] = [];
  if (measured.frontPadMm != null) out.push(BrakeComponentInstallationType.FRONT_PADS);
  if (measured.rearPadMm != null) out.push(BrakeComponentInstallationType.REAR_PADS);
  if (measured.frontDiscMm != null) out.push(BrakeComponentInstallationType.FRONT_DISCS);
  if (measured.rearDiscMm != null) out.push(BrakeComponentInstallationType.REAR_DISCS);
  return out;
}

export function allowedComponentsForKind(kind: BrakeServiceKind): BrakeComponentInstallationType[] | null {
  switch (kind) {
    case BrakeServiceKind.INSPECTION_ONLY:
    case BrakeServiceKind.BRAKE_FLUID_SERVICE:
      return [];
    case BrakeServiceKind.PADS_SERVICE:
      return [
        BrakeComponentInstallationType.FRONT_PADS,
        BrakeComponentInstallationType.REAR_PADS,
      ];
    case BrakeServiceKind.DISCS_SERVICE:
      return [
        BrakeComponentInstallationType.FRONT_DISCS,
        BrakeComponentInstallationType.REAR_DISCS,
      ];
    case BrakeServiceKind.FULL_BRAKE_SERVICE:
      return [
        BrakeComponentInstallationType.FRONT_PADS,
        BrakeComponentInstallationType.REAR_PADS,
        BrakeComponentInstallationType.FRONT_DISCS,
        BrakeComponentInstallationType.REAR_DISCS,
      ];
    default:
      return null;
  }
}

export function serviceKindAllowsReplacement(kind: BrakeServiceKind): boolean {
  return (
    kind === BrakeServiceKind.PADS_SERVICE ||
    kind === BrakeServiceKind.DISCS_SERVICE ||
    kind === BrakeServiceKind.FULL_BRAKE_SERVICE
  );
}

export function serviceKindIsHistoryOnly(kind: BrakeServiceKind): boolean {
  return kind === BrakeServiceKind.INSPECTION_ONLY || kind === BrakeServiceKind.BRAKE_FLUID_SERVICE;
}

/**
 * Resolve the component set for a brake service. Service kind alone never expands
 * to all four components — explicit scope or measured inference is required.
 */
export function resolveServiceComponentScope(input: {
  kind: BrakeServiceKind;
  scope?: BrakeLifecycleScopeToken[];
  measured: BrakeMeasuredSnapshot;
  allowMeasurementInference?: boolean;
}): {
  profile: BrakeServiceScopeProfile;
  components: BrakeComponentInstallationType[];
} {
  const { kind, measured, allowMeasurementInference = true } = input;
  const explicit = normalizeScopeTokens(input.scope ?? []);

  if (kind === BrakeServiceKind.INSPECTION_ONLY) {
    if (explicit.length > 0) {
      throw new Error('inspection_scope_not_allowed');
    }
    return { profile: 'INSPECTION_ONLY', components: [] };
  }

  if (kind === BrakeServiceKind.BRAKE_FLUID_SERVICE) {
    if (explicit.length > 0) {
      throw new Error('fluid_service_scope_not_allowed');
    }
    return { profile: 'BRAKE_FLUID_SERVICE', components: [] };
  }

  const allowed = allowedComponentsForKind(kind);
  if (!allowed) {
    throw new Error('unsupported_service_kind');
  }

  let components = explicit;
  if (components.length === 0) {
    if (kind === BrakeServiceKind.FULL_BRAKE_SERVICE) {
      throw new Error('full_service_requires_explicit_scope');
    }
    if (!allowMeasurementInference) {
      throw new Error('explicit_scope_required');
    }
    components = inferScopeFromMeasurements(measured);
  }

  if (components.length === 0) {
    throw new Error('explicit_scope_required');
  }

  assertScopeAllowsOnly(allowed, components);
  validateAxleScopedSet(components);

  if (kind === BrakeServiceKind.FULL_BRAKE_SERVICE) {
    assertExplicitScope(components, { serviceKind: kind });
  }

  for (const key of Object.keys(measured) as Array<keyof BrakeMeasuredSnapshot>) {
    if (measured[key] == null) continue;
    const owner = componentForThicknessField(key);
    if (!components.includes(owner)) {
      throw new Error(`thickness_outside_scope:${key}`);
    }
  }

  const profile =
    kind === BrakeServiceKind.FULL_BRAKE_SERVICE
      ? 'FULL_BRAKE_SERVICE'
      : profileForExplicitScope(components.map(componentToScopeToken)) ?? 'FULL_BRAKE_SERVICE';

  return { profile, components };
}

export function componentsForProfile(
  profile: BrakeServiceScopeProfile,
  explicitComponents: BrakeComponentInstallationType[],
): BrakeComponentInstallationType[] {
  if (profile === 'FULL_BRAKE_SERVICE') {
    return explicitComponents;
  }
  return PROFILE_COMPONENTS[profile];
}

export function componentForThicknessField(
  field: keyof BrakeMeasuredSnapshot,
): BrakeComponentInstallationType {
  switch (field) {
    case 'frontPadMm':
      return BrakeComponentInstallationType.FRONT_PADS;
    case 'rearPadMm':
      return BrakeComponentInstallationType.REAR_PADS;
    case 'frontDiscMm':
      return BrakeComponentInstallationType.FRONT_DISCS;
    default:
      return BrakeComponentInstallationType.REAR_DISCS;
  }
}

export function componentToScopeToken(
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

export function isPadComponent(component: BrakeComponentInstallationType): boolean {
  return PAD_COMPONENTS.has(component);
}

export function isDiscComponent(component: BrakeComponentInstallationType): boolean {
  return DISC_COMPONENTS.has(component);
}
