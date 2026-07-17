import type { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';
import type { DocumentApplyFeatureFlags } from './document-apply-safety.types';

export function buildDocumentApplyFeatureFlags(
  config: ConfigType<typeof documentExtractionConfig>,
): DocumentApplyFeatureFlags {
  return {
    masterApplyEnabled: config.applyEnabled,
    perTypeApplyEnabled: config.applyDisabledTypes,
    strictIdempotency: config.applyStrictIdempotency,
  };
}
