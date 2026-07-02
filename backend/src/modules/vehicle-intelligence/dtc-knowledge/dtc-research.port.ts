import {
  DtcKnowledgeSourceRef,
  DtcRentalRecommendation,
  DtcUrgency,
  DtcVehicleContext,
} from './dtc-knowledge.types';

/**
 * Adapter token for the DTC research layer. The default binding uses the Mistral
 * AI Gateway (structured JSON). A future provider can implement the same port.
 */
export const DTC_RESEARCH_PORT = Symbol('DTC_RESEARCH_PORT');

export interface DtcResearchInput {
  code: string;
  normalizedCode: string;
  language: string;
  /** 'generic' = code meaning only; 'vehicle' = make/model/year-specific. */
  mode: 'generic' | 'vehicle';
  systemCategory?: string;
  standardType?: string;
  vehicle?: DtcVehicleContext;
}

/** Structured, already-sanitized research output (compact summaries only). */
export interface DtcResearchOutput {
  title?: string | null;
  standardType?: string | null;
  systemCategory?: string | null;
  shortDescription?: string | null;
  possibleCauses?: string[];
  possibleEffects?: string[];
  technicalUrgency?: DtcUrgency;
  rentalUrgency?: DtcUrgency;
  rentalRecommendation?: DtcRentalRecommendation;
  recommendedAction?: string | null;
  sourceType?: string | null;
  sources?: DtcKnowledgeSourceRef[];
  needsReview?: boolean;
  // Vehicle-specific (only populated for mode === 'vehicle')
  vehicleSpecificTitle?: string | null;
  vehicleSpecificDescription?: string | null;
  vehicleSpecificEffects?: string[];
  vehicleSpecificUrgency?: DtcUrgency;
  vehicleRentalRecommendation?: DtcRentalRecommendation;
}

export interface DtcResearchResponse {
  success: boolean;
  data?: DtcResearchOutput;
  /** Sanitized, short error (never contains secrets or raw agent output). */
  error?: string;
}

export interface DtcResearchPort {
  isEnabled(): boolean;
  research(input: DtcResearchInput): Promise<DtcResearchResponse>;
}
