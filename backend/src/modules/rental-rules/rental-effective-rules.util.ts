import type {
  EffectiveRentalRules,
  EffectiveRuleField,
  RentalRuleFieldKey,
  RentalRuleFieldSet,
  RentalRuleSource,
} from './rental-rules.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';

export interface RentalRuleLayer {
  source: RentalRuleSource;
  sourceName: string;
  values: Partial<RentalRuleFieldSet>;
}

function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function resolveEffectiveField<T>(
  layers: Array<{ source: RentalRuleSource; sourceName: string; value: T | null | undefined }>,
): EffectiveRuleField<T> {
  for (const layer of layers) {
    if (isSet(layer.value)) {
      return {
        value: layer.value,
        source: layer.source,
        sourceName: layer.sourceName,
      };
    }
  }
  return { value: null, source: null, sourceName: null };
}

export function buildEffectiveRentalRules(input: {
  organizationId: string;
  vehicleId: string;
  orgLayer: RentalRuleLayer;
  categoryLayer: RentalRuleLayer | null;
  vehicleLayer: RentalRuleLayer | null;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  rentalCategoryType: EffectiveRentalRules['rentalCategoryType'];
  rulesActive: boolean;
}): EffectiveRentalRules {
  const priorityLayers = [
    input.vehicleLayer,
    input.categoryLayer,
    input.orgLayer,
  ].filter(Boolean) as RentalRuleLayer[];

  const result = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    rentalCategoryId: input.rentalCategoryId,
    rentalCategoryName: input.rentalCategoryName,
    rentalCategoryType: input.rentalCategoryType,
    rulesActive: input.rulesActive,
  } as EffectiveRentalRules;

  for (const key of RENTAL_RULE_FIELD_KEYS) {
    (result as unknown as Record<string, EffectiveRuleField<unknown>>)[key] = resolveEffectiveField(
      priorityLayers.map((layer) => ({
        source: layer.source,
        sourceName: layer.sourceName,
        value: layer.values[key],
      })),
    );
  }

  return result;
}
