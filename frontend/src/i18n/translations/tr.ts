import type { PartialTranslationDictionary } from '../dictionary-types';
import { masterPlatformOpsDiS4Tr } from './master.platformOps.diS4.tr';

/**
 * Turkish product-copy dictionary (partial — master platform ops S4 keys native).
 */
export const tr = {
  ...masterPlatformOpsDiS4Tr,
} satisfies PartialTranslationDictionary;
