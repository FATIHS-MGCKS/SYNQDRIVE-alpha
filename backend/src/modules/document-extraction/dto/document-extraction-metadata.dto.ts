export interface DocumentExtractionMetadataOptionDto {
  value: string;
  labelKey: string;
}

export interface DocumentExtractionMetadataDto {
  documentTypes: DocumentExtractionMetadataOptionDto[];
  documentCategories: DocumentExtractionMetadataOptionDto[];
  documentSubtypes: DocumentExtractionMetadataOptionDto[];
  taxonomyVersion: string;
  schemaRegistryVersion: string;
  classificationOptions: DocumentExtractionMetadataOptionDto[];
  mimeTypes: string[];
  extensions: string[];
  maxUploadBytes: number;
  maxUploadMb: number;
  statuses: DocumentExtractionMetadataOptionDto[];
  stages: DocumentExtractionMetadataOptionDto[];
  errorPhases: DocumentExtractionMetadataOptionDto[];
  uploadDuplicateStatuses: DocumentExtractionMetadataOptionDto[];
}
