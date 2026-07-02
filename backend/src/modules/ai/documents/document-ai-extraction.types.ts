/** Field descriptor for document extraction prompts/schemas. */
export interface DocumentAiField {
  key: string;
  label: string;
  type: string;
  enumValues?: string[];
}

export interface DocumentAiVehicleContext {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  licensePlate?: string;
  lastKnownOdometerKm?: number;
}

export interface DocumentAiExtractInput {
  documentType: string;
  fields: DocumentAiField[];
  rawText: string;
  vehicleContext?: DocumentAiVehicleContext;
  /** When present, vehicle has DIMO telemetry linkage (context flag only). */
  dimoTokenId?: number;
}

export interface DocumentAiExtractResult {
  success: boolean;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes: string[];
  dimoContextAvailable: boolean;
  providerId?: string;
  error?: string;
}

export interface DocumentAiExtractionResponse {
  documentType: string;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes?: string[];
}
