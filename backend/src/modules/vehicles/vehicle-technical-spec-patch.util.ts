import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  getProtectedProvenanceValue,
  normalizeProvenanceStorageKey,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-field-mapping.util';
import type { RegistrationIdentityProvenanceDocument } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-canonical.types';
import { isProtectedProvenanceEntry } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import {
  formatFrontRearWeightDistribution,
  parseFrontWeightDistributionPct,
  parsePositiveIntegerField,
  valuesEqualScalar,
} from './vehicle-technical-spec.util';

export type VehicleTechnicalSpecFieldKey =
  | 'engineDisplacementCc'
  | 'cylinderCount'
  | 'frontWeightDistributionPct';

export type VehicleTechnicalSpecificationSaveMeta = {
  confirmedFieldKeys?: string[];
};

export type VehicleTechnicalSpecificationPatchInput = {
  engineDisplacementCc?: number | string | null;
  cylinderCount?: number | string | null;
  frontWeightDistributionPct?: number | string | null;
  frontToRearWeightDistribution?: string | null;
  technicalSpecificationSave?: VehicleTechnicalSpecificationSaveMeta;
};

export type VehicleTechnicalSpecificationVehicleRow = {
  engineDisplacementCc: number | null;
  cylinderCount: number | null;
  frontWeightDistributionPct: number | null;
  registrationIdentityProvenance: unknown;
};

const AI_PROVENANCE_CATEGORIES = new Set(['AI_ESTIMATED', 'KNOWLEDGE_ONLY']);

function provenanceEntryForKey(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: string,
) {
  if (!doc?.fields) return undefined;
  const direct = doc.fields[storageKey as keyof typeof doc.fields];
  if (direct) return direct;
  for (const [rawKey, entry] of Object.entries(doc.fields)) {
    if (normalizeProvenanceStorageKey(rawKey) === storageKey) return entry;
  }
  return undefined;
}

function isProtectedTechnicalField(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
): boolean {
  if (storageKey === 'displacementCc') {
    return getProtectedProvenanceValue(doc, 'displacementCc') != null;
  }
  const entry = provenanceEntryForKey(doc, storageKey);
  return isProtectedProvenanceEntry(entry);
}

function protectedValue(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
): number | null {
  if (storageKey === 'displacementCc') {
    const entry = getProtectedProvenanceValue(doc, 'displacementCc');
    const v = entry?.value;
    return typeof v === 'number' ? v : null;
  }
  const entry = provenanceEntryForKey(doc, storageKey);
  if (!isProtectedProvenanceEntry(entry)) return null;
  const v = entry?.value;
  return typeof v === 'number' ? v : null;
}

export function buildVehicleTechnicalSpecificationPrismaPatch(
  vehicle: VehicleTechnicalSpecificationVehicleRow,
  input: VehicleTechnicalSpecificationPatchInput,
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
): Prisma.VehicleUpdateInput {
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).map((k) =>
      k === 'frontToRearWeightDistribution' ? 'frontWeightDistributionPct' : k,
    ),
  );

  const patch: Prisma.VehicleUpdateInput = {};
  const provenanceUpdates: RegistrationIdentityProvenanceDocument = provenanceDoc
    ? { ...provenanceDoc, fields: { ...provenanceDoc.fields } }
    : { version: 1, updatedAt: new Date().toISOString(), fields: {} };

  const considerField = (
    key: VehicleTechnicalSpecFieldKey,
    next: number | null,
    current: number | null,
    provenanceStorageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
  ) => {
    if (valuesEqualScalar(next, current)) return;

    if (isProtectedTechnicalField(provenanceDoc, provenanceStorageKey)) {
      const locked = protectedValue(provenanceDoc, provenanceStorageKey);
      if (locked != null && !valuesEqualScalar(next, locked) && !confirmed.has(key)) {
        throw new BadRequestException({
          message: `Protected USER_CONFIRMED value for ${key} cannot be changed without explicit confirmation.`,
          code: 'VEHICLE_TECH_SPEC_USER_CONFIRMED_BLOCKED',
          field: key,
        });
      }
    }

    if (!confirmed.has(key)) {
      throw new BadRequestException({
        message: `Field ${key} requires explicit user confirmation before save.`,
        code: 'VEHICLE_TECH_SPEC_CONFIRMATION_REQUIRED',
        field: key,
      });
    }

    if (key === 'engineDisplacementCc') {
      patch.engineDisplacementCc = next;
    } else if (key === 'cylinderCount') {
      patch.cylinderCount = next;
    } else {
      patch.frontWeightDistributionPct = next;
    }

    provenanceUpdates.fields[provenanceStorageKey as keyof typeof provenanceUpdates.fields] = {
      value: next,
      provenance: 'USER_CONFIRMED',
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: new Date().toISOString(),
      documentExtractionId: null,
    };
  };

  if (
    input.engineDisplacementCc !== undefined ||
    input.cylinderCount !== undefined ||
    input.frontWeightDistributionPct !== undefined ||
    input.frontToRearWeightDistribution !== undefined
  ) {
    let nextDisplacement: number | null | undefined;
    if (input.engineDisplacementCc !== undefined) {
      if (input.engineDisplacementCc === null || input.engineDisplacementCc === '') {
        nextDisplacement = null;
      } else {
        const parsed = parsePositiveIntegerField(input.engineDisplacementCc);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'engineDisplacementCc must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_DISPLACEMENT',
          });
        }
        nextDisplacement = parsed;
      }
      considerField(
        'engineDisplacementCc',
        nextDisplacement ?? null,
        vehicle.engineDisplacementCc,
        'displacementCc',
      );
    }

    if (input.cylinderCount !== undefined) {
      let nextCyl: number | null;
      if (input.cylinderCount === null || input.cylinderCount === '') {
        nextCyl = null;
      } else {
        const parsed = parsePositiveIntegerField(input.cylinderCount);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'cylinderCount must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_CYLINDER_COUNT',
          });
        }
        nextCyl = parsed;
      }
      considerField('cylinderCount', nextCyl, vehicle.cylinderCount, 'cylinderCount');
    }

    const frontInput =
      input.frontWeightDistributionPct !== undefined
        ? input.frontWeightDistributionPct
        : input.frontToRearWeightDistribution;
    if (frontInput !== undefined) {
      let nextFront: number | null;
      if (frontInput === null || frontInput === '') {
        nextFront = null;
      } else {
        const parsed = parseFrontWeightDistributionPct(frontInput);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'frontWeightDistributionPct must be a valid front axle percent (e.g. 58 or 58/42).',
            code: 'VEHICLE_TECH_SPEC_INVALID_WEIGHT_DISTRIBUTION',
          });
        }
        nextFront = parsed;
      }
      considerField(
        'frontWeightDistributionPct',
        nextFront,
        vehicle.frontWeightDistributionPct,
        'frontWeightDistributionPct',
      );
    }
  }

  if (Object.keys(provenanceUpdates.fields).length > 0) {
    provenanceUpdates.updatedAt = new Date().toISOString();
    patch.registrationIdentityProvenance = provenanceUpdates as Prisma.InputJsonValue;
  }

  return patch;
}

export function mapVehicleTechnicalSpecsToRegisteredVehicleFields(vehicle: {
  engineDisplacementCc: number | null;
  cylinderCount: number | null;
  frontWeightDistributionPct: number | null;
}): {
  engineDisplacementCc: string;
  cylinderCount: string;
  frontToRearWeightDistribution: string;
} {
  return {
    engineDisplacementCc:
      vehicle.engineDisplacementCc != null ? String(vehicle.engineDisplacementCc) : '',
    cylinderCount: vehicle.cylinderCount != null ? String(vehicle.cylinderCount) : '',
    frontToRearWeightDistribution: formatFrontRearWeightDistribution(
      vehicle.frontWeightDistributionPct,
    ),
  };
}

export function extractTechnicalSpecificationPatchInput(
  body: Record<string, unknown>,
): VehicleTechnicalSpecificationPatchInput | null {
  const keys = [
    'engineDisplacementCc',
    'cylinderCount',
    'frontWeightDistributionPct',
    'frontToRearWeightDistribution',
    'technicalSpecificationSave',
  ];
  const hasAny = keys.some((k) => body[k] !== undefined);
  if (!hasAny) return null;
  return {
    engineDisplacementCc: body.engineDisplacementCc as number | string | null | undefined,
    cylinderCount: body.cylinderCount as number | string | null | undefined,
    frontWeightDistributionPct: body.frontWeightDistributionPct as number | string | null | undefined,
    frontToRearWeightDistribution: body.frontToRearWeightDistribution as string | null | undefined,
    technicalSpecificationSave: body.technicalSpecificationSave as
      | VehicleTechnicalSpecificationSaveMeta
      | undefined,
  };
}

export function stripTechnicalSpecificationKeysFromUpdateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  for (const key of [
    'engineDisplacementCc',
    'cylinderCount',
    'frontWeightDistributionPct',
    'frontToRearWeightDistribution',
    'technicalSpecificationSave',
    'aiFieldProvenance',
  ]) {
    delete next[key];
  }
  return next;
}

/** True when this save corrects a USER_CONFIRMED technical field (needs optimistic concurrency). */
export function technicalSpecSaveRequiresOptimisticConcurrency(
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
  vehicle: VehicleTechnicalSpecificationVehicleRow,
  input: VehicleTechnicalSpecificationPatchInput,
): boolean {
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).map((k) =>
      k === 'frontToRearWeightDistribution' ? 'frontWeightDistributionPct' : k,
    ),
  );
  if (confirmed.size === 0) return false;

  if (input.engineDisplacementCc !== undefined && confirmed.has('engineDisplacementCc')) {
    if (isProtectedTechnicalField(provenanceDoc, 'displacementCc')) {
      const locked = protectedValue(provenanceDoc, 'displacementCc');
      let next: number | null;
      if (input.engineDisplacementCc === null || input.engineDisplacementCc === '') {
        next = null;
      } else {
        next = parsePositiveIntegerField(input.engineDisplacementCc);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  if (input.cylinderCount !== undefined && confirmed.has('cylinderCount')) {
    if (isProtectedTechnicalField(provenanceDoc, 'cylinderCount')) {
      const locked = protectedValue(provenanceDoc, 'cylinderCount');
      let next: number | null;
      if (input.cylinderCount === null || input.cylinderCount === '') {
        next = null;
      } else {
        next = parsePositiveIntegerField(input.cylinderCount);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  const frontInput =
    input.frontWeightDistributionPct !== undefined
      ? input.frontWeightDistributionPct
      : input.frontToRearWeightDistribution;
  if (frontInput !== undefined && confirmed.has('frontWeightDistributionPct')) {
    if (isProtectedTechnicalField(provenanceDoc, 'frontWeightDistributionPct')) {
      const locked = protectedValue(provenanceDoc, 'frontWeightDistributionPct');
      let next: number | null;
      if (frontInput === null || frontInput === '') {
        next = null;
      } else {
        next = parseFrontWeightDistributionPct(frontInput);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  return false;
}

/** Returns true when client marks a field as AI-sourced without user confirmation. */
export function assertAiTechnicalFieldsConfirmed(
  input: VehicleTechnicalSpecificationPatchInput,
  aiFieldProvenance: Record<string, { category?: string }> | null | undefined,
): void {
  if (!aiFieldProvenance) return;
  const confirmed = new Set(input.technicalSpecificationSave?.confirmedFieldKeys ?? []);
  const aiKeys: Array<{ formKey: string; patchKey: string }> = [
    { formKey: 'engineDisplacementCc', patchKey: 'engineDisplacementCc' },
    { formKey: 'cylinderCount', patchKey: 'cylinderCount' },
    { formKey: 'frontToRearWeightDistribution', patchKey: 'frontToRearWeightDistribution' },
  ];
  for (const { formKey, patchKey } of aiKeys) {
    const meta = aiFieldProvenance[formKey];
    if (!meta?.category || !AI_PROVENANCE_CATEGORIES.has(meta.category)) continue;
    if (input[patchKey as keyof VehicleTechnicalSpecificationPatchInput] === undefined) continue;
    if (!confirmed.has(formKey) && !confirmed.has(patchKey)) {
      throw new BadRequestException({
        message: `AI-suggested field ${formKey} requires explicit confirmation before persistence.`,
        code: 'VEHICLE_TECH_SPEC_AI_CONFIRMATION_REQUIRED',
        field: formKey,
      });
    }
  }
}
