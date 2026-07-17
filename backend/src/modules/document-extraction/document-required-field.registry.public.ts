import { listDocumentRequiredFieldProfiles } from './document-required-field.registry';
import type {
  PublicDocumentRequiredFieldProfileDto,
  PublicDocumentRequiredFieldRegistryDto,
} from './dto/document-required-field-registry.dto';
import { DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION } from './document-required-field.registry.types';

export function buildPublicRequiredFieldRegistryDto(): PublicDocumentRequiredFieldRegistryDto {
  return {
    version: DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION,
    profiles: listDocumentRequiredFieldProfiles().map(toPublicProfileDto),
  };
}

function toPublicProfileDto(
  profile: ReturnType<typeof listDocumentRequiredFieldProfiles>[number],
): PublicDocumentRequiredFieldProfileDto {
  return {
    profileKey: profile.profileKey,
    effectiveDocumentType: profile.effectiveDocumentType,
    documentSubtypes: profile.documentSubtypes,
    planningMode: profile.planningMode,
    documentMode: profile.documentMode,
    requiredForReview: profile.requiredForReview,
    requiredForDraft: profile.requiredForDraft,
    requiredForApply: profile.requiredForApply,
    optionalFields: profile.optionalFields,
    conditionalFields: profile.conditionalFields.map((rule) => ({
      id: rule.id,
      stages: [...rule.stages],
      require: rule.require as Record<string, unknown>,
      message: rule.message,
    })),
    entityRequirements: profile.entityRequirements.map((rule) => ({
      entityType: rule.entityType,
      stages: [...rule.stages],
      confirmationRequired: rule.confirmationRequired,
    })),
    allowedActions: [...profile.allowedActions],
    blockingRules: profile.blockingRules.map((rule) => ({
      code: rule.code,
      message: rule.message,
      stages: [...rule.stages],
    })),
  };
}

export function findPublicRequiredFieldProfile(
  profileKey: string,
): PublicDocumentRequiredFieldProfileDto | null {
  const profile = listDocumentRequiredFieldProfiles().find((row) => row.profileKey === profileKey);
  return profile ? toPublicProfileDto(profile) : null;
}
