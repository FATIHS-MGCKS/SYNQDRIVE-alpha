import type { PartialTranslationDictionary } from '../dictionary-types';
import { rentalTripGpsSpeedEvaluationTr } from './rental.tripGpsSpeedEvaluation.tr';

/**
 * Turkish product-copy dictionary.
 * Intentionally sparse until P3 native translation work — runtime uses explicit English fallback.
 */
export const tr = {
  ...rentalTripGpsSpeedEvaluationTr,
} satisfies PartialTranslationDictionary;
