import type { PartialTranslationDictionary } from '../dictionary-types';

/**
 * Turkish product-copy dictionary.
 * Intentionally sparse until P3 native translation work — runtime uses explicit English fallback.
 */
export const tr = {
  'master.cv.mapping.mirrorProvider': 'DIMO aynası (sağlayıcı)',
  'master.cv.mapping.effectiveSynqDriveAccess': 'SynqDrive erişimi (etkin)',
} satisfies PartialTranslationDictionary;
